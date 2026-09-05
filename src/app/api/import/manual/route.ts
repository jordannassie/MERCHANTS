import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ensureWorkspaceTerritory } from '@/lib/workspace'
import { scoreLead } from '@/lib/scoring'
import {
  normalize,
  parseDate,
  buildSoQLWhereStatewide,
  buildCutoffIso,
} from '@/lib/importer-utils'

const TEXAS_API = 'https://data.texas.gov/resource/jrea-zgmq.json'

/**
 * Records per Socrata API page.
 * 1 000 keeps each page well inside the Netlify function budget while
 * minimising round-trips for the auto-loop.
 * (Previous value of 5 000 caused N+1 UPDATE timeouts.)
 */
const PAGE_SIZE = 1_000

/**
 * Wall-clock budget per invocation (ms).
 * Leaves ~8 s headroom inside a 26-second Netlify function limit.
 * When budget expires the endpoint returns status='partial' with nextOffset
 * so the caller can immediately resume.
 */
const BUDGET_MS = 18_000

/**
 * Batch size for DB upsert/insert operations.
 * Keeps each Supabase call small and predictable.
 */
const DB_BATCH = 500

const TEXAS_FIELDS = [
  'taxpayer_number', 'taxpayer_name', 'taxpayer_address', 'taxpayer_city',
  'taxpayer_state', 'taxpayer_zip_code', 'taxpayer_county_code',
  'taxpayer_organization_type', 'outlet_number', 'outlet_name',
  'outlet_address', 'outlet_city', 'outlet_state', 'outlet_zip_code',
  'outlet_county_code', 'outlet_naics_code',
  'outlet_inside_outside_city_limits_indicator',
  'outlet_permit_issue_date', 'outlet_first_sales_date',
].join(',')

// Simple in-memory gate: one import at a time per server instance
let importInProgress = false

export async function POST(req: NextRequest) {
  // ── Parse request body ─────────────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body stays empty */ }

  const resumeRunId: string | null = (body.importRunId as string) ?? null
  const startOffset: number       = (body.offset  as number)    ?? 0

  if (importInProgress) {
    return NextResponse.json(
      { error: 'An import is already running. Please wait a moment and try again.' },
      { status: 429 }
    )
  }

  const db = createServiceClient()

  // Mark runs stuck in 'running' for > 30 min as failed (non-critical)
  try {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    await db
      .from('import_runs')
      .update({ status: 'failed', error_message: 'Import timed out — marked stale', completed_at: new Date().toISOString() })
      .eq('status', 'running')
      .lt('started_at', staleThreshold)
  } catch { /* non-critical */ }

  let territory: Awaited<ReturnType<typeof ensureWorkspaceTerritory>>
  try {
    territory = await ensureWorkspaceTerritory()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Territory not ready: ${msg}` }, { status: 500 })
  }

  const cutoffIso   = buildCutoffIso(territory.days_to_import)
  const whereClause = buildSoQLWhereStatewide(cutoffIso)

  // ── Create new run OR resume existing one ──────────────────────────────────
  interface RunRow {
    id: string
    fetched_count:   number | null
    inserted_count:  number | null
    updated_count:   number | null
    duplicate_count: number | null
    skipped_count:   number | null
    started_at:      string
  }

  let run: RunRow

  if (resumeRunId) {
    const { data: existingRun, error: findErr } = await db
      .from('import_runs')
      .select('id, fetched_count, inserted_count, updated_count, duplicate_count, skipped_count, started_at')
      .eq('id', resumeRunId)
      .single()

    if (findErr || !existingRun) {
      return NextResponse.json({ error: 'Import run not found; start a fresh import.' }, { status: 404 })
    }
    // Re-mark as running for this batch
    await db.from('import_runs').update({ status: 'running' }).eq('id', resumeRunId)
    run = existingRun as RunRow
  } else {
    const { data: newRun, error: runErr } = await db
      .from('import_runs')
      .insert({
        territory_id:          territory.id,
        source:                'texas_sales_tax_permits',
        status:                'running',
        requested_start_date:  cutoffIso.slice(0, 10),
        county_codes:          [],   // statewide — no county restriction
      })
      .select()
      .single()

    if (runErr || !newRun) {
      const detail = runErr
        ? [runErr.message, runErr.code, runErr.details].filter(Boolean).join(' | ')
        : 'unknown'
      console.error('[import/manual] Failed to create import run:', detail)
      return NextResponse.json({ error: 'Failed to create import run.' }, { status: 500 })
    }
    run = newRun as RunRow
  }

  importInProgress = true

  // Per-batch counters
  let fetched = 0, inserted = 0, updated = 0, duplicates = 0, skipped = 0
  let errorMessage: string | null = null
  let reachedEnd = false
  let currentOffset = startOffset   // tracks Socrata $offset as we page

  try {
    const deadline = Date.now() + BUDGET_MS

    while (true) {
      // Check time budget BEFORE fetching next page
      if (Date.now() > deadline) {
        break
      }

      const params = new URLSearchParams({
        '$select': TEXAS_FIELDS,
        '$where':  whereClause,
        '$order':  'outlet_permit_issue_date ASC,taxpayer_number,outlet_number',
        '$limit':  String(PAGE_SIZE),
        '$offset': String(currentOffset),
      })

      const resp = await fetch(`${TEXAS_API}?${params}`, {
        signal: AbortSignal.timeout(30_000),
      })
      if (!resp.ok) {
        errorMessage = `Texas API HTTP ${resp.status}`
        break
      }

      const page: Record<string, string>[] = await resp.json()
      fetched += page.length

      // ── Lookup existing leads for this page ────────────────────────────────
      // Batch by taxpayer_number in chunks of 200 to stay well inside
      // Supabase's query size limits.
      const taxpayerOutletPairs = page
        .map(raw => ({
          taxpayerNum: normalize(raw.taxpayer_number),
          outletNum:   normalize(raw.outlet_number),
        }))
        .filter(p => p.taxpayerNum && p.outletNum)

      const uniqueTaxpayers = [...new Set(taxpayerOutletPairs.map(p => p.taxpayerNum!))]

      interface ExistingLead { id: string; taxpayer_number: string; outlet_number: string | null; status: string; score: number; priority: string; lead_source_label: string | null }
      const existingLeads: ExistingLead[] = []

      const LOOKUP_CHUNK = 200
      for (let i = 0; i < uniqueTaxpayers.length; i += LOOKUP_CHUNK) {
        const chunk = uniqueTaxpayers.slice(i, i + LOOKUP_CHUNK)
        const { data } = await db
          .from('leads')
          .select('id, taxpayer_number, outlet_number, status, score, priority, lead_source_label')
          .eq('source', 'texas_sales_tax_permits')
          .in('taxpayer_number', chunk)
        if (data) existingLeads.push(...(data as ExistingLead[]))
      }

      const existingMap = new Map<string, ExistingLead>()
      for (const lead of existingLeads) {
        if (!lead.taxpayer_number || !lead.outlet_number) continue
        existingMap.set(`${lead.taxpayer_number}|${lead.outlet_number}`, lead)
      }

      // ── Classify records as new inserts vs existing updates ───────────────
      // New records: inserted with status='new', starred=false.
      // Existing records: upserted — only source + score fields are touched;
      //   CRM fields (status, starred, primary_phone, etc.) are NOT in the
      //   payload and are therefore preserved by PostgreSQL's ON CONFLICT DO UPDATE.
      const ADVANCED_STATUSES = new Set(['connected', 'follow_up', 'appointment', 'won'])

      const toInsert: Record<string, unknown>[] = []
      const toUpdate: Record<string, unknown>[] = []

      for (const raw of page) {
        const taxpayerNum = normalize(raw.taxpayer_number)
        const outletNum   = normalize(raw.outlet_number)
        const permitDate  = parseDate(raw.outlet_permit_issue_date)

        // taxpayer, outlet, and permit date are hard requirements
        if (!taxpayerNum || !outletNum || !permitDate) {
          skipped++
          continue
        }

        // outlet_county_code may be null/blank for some permit types —
        // do NOT skip; store null and let the lead through.
        const outletCounty = normalize(raw.outlet_county_code)

        const firstSalesDate = parseDate(raw.outlet_first_sales_date)
        const outletName     = normalize(raw.outlet_name)
        const taxpayerName   = normalize(raw.taxpayer_name)
        const displayName    = outletName ?? taxpayerName ?? null

        const scored = scoreLead({
          naicsCode:                normalize(raw.outlet_naics_code),
          permitIssueDate:          permitDate,
          firstSalesDate,
          businessName:             displayName,
          outletName,
          taxpayerName,
          outletAddress:            normalize(raw.outlet_address),
          taxpayerOrganizationType: normalize(raw.taxpayer_organization_type),
        })

        const sourceFields = {
          taxpayer_number:            taxpayerNum,
          outlet_number:              outletNum,
          taxpayer_name:              taxpayerName,
          taxpayer_address:           normalize(raw.taxpayer_address),
          taxpayer_city:              normalize(raw.taxpayer_city),
          taxpayer_state:             normalize(raw.taxpayer_state),
          taxpayer_zip:               normalize(raw.taxpayer_zip_code),
          taxpayer_county_code:       normalize(raw.taxpayer_county_code),
          taxpayer_organization_type: normalize(raw.taxpayer_organization_type),
          outlet_name:                outletName,
          outlet_address:             normalize(raw.outlet_address),
          outlet_city:                normalize(raw.outlet_city),
          outlet_state:               normalize(raw.outlet_state),
          outlet_zip:                 normalize(raw.outlet_zip_code),
          outlet_county_code:         outletCounty,
          naics_code:                 normalize(raw.outlet_naics_code),
          inside_outside_city:        normalize(raw.outlet_inside_outside_city_limits_indicator),
          permit_issue_date:          permitDate,
          first_sales_date:           firstSalesDate,
          raw_record:                 raw,
          last_seen_at:               new Date().toISOString(),
        }

        const key      = `${taxpayerNum}|${outletNum}`
        const existing = existingMap.get(key)

        if (existing) {
          // Update existing lead — preserve CRM fields by omitting them
          // from the payload. Score/priority preserved for advanced leads.
          toUpdate.push({
            source:             'texas_sales_tax_permits',
            ...sourceFields,
            display_name:       displayName,
            score:              ADVANCED_STATUSES.has(existing.status) ? existing.score    : scored.score,
            priority:           ADVANCED_STATUSES.has(existing.status) ? existing.priority : scored.priority,
            score_reasons:      scored.reasons,
            category:           scored.category ?? undefined,
            // Only tag as 'state' if not already 'both' (preserve google enrichment)
            lead_source_label:  existing.lead_source_label === 'both' ? 'both' : 'state',
          })
        } else {
          // Brand-new record
          toInsert.push({
            territory_id:       territory.id,
            source:             'texas_sales_tax_permits',
            ...sourceFields,
            display_name:       displayName,
            lead_source_label:  'state',
            score:              scored.score,
            priority:      scored.priority,
            score_reasons: scored.reasons,
            category:      scored.category ?? undefined,
            status:        'new',
            starred:       false,
          })
        }
      }

      // ── Bulk INSERT new records ────────────────────────────────────────────
      for (let i = 0; i < toInsert.length; i += DB_BATCH) {
        if (Date.now() > deadline) break
        const batch = toInsert.slice(i, i + DB_BATCH)
        const { error: insErr, data: insData } = await db
          .from('leads')
          .insert(batch)
          .select('id')

        if (insErr) {
          if (insErr.code === '23505') {
            duplicates += batch.length
          } else {
            console.error('[import/manual] batch insert error:', insErr.message, insErr.code)
            skipped += batch.length
          }
        } else {
          inserted += insData?.length ?? batch.length
        }
      }

      // ── Bulk UPSERT existing records (source fields only — CRM preserved) ─
      // Uses ON CONFLICT (source, taxpayer_number, outlet_number) DO UPDATE.
      // Columns NOT in the payload (status, starred, primary_phone, etc.)
      // are untouched by PostgreSQL's partial-column upsert semantics.
      for (let i = 0; i < toUpdate.length; i += DB_BATCH) {
        if (Date.now() > deadline) break
        const batch = toUpdate.slice(i, i + DB_BATCH)
        const { error: upErr } = await db
          .from('leads')
          .upsert(batch, {
            onConflict:      'source,taxpayer_number,outlet_number',
            ignoreDuplicates: false,
          })

        if (upErr) {
          console.error('[import/manual] batch upsert error:', upErr.message, upErr.code)
          skipped += batch.length
        } else {
          updated += batch.length
        }
      }

      // End of data — last page was smaller than PAGE_SIZE
      if (page.length < PAGE_SIZE) {
        reachedEnd = true
        break
      }

      // Advance Socrata offset for next page
      currentOffset += PAGE_SIZE
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e)
  } finally {
    importInProgress = false
  }

  // ── Accumulate on top of prior batches ─────────────────────────────────────
  const prevFetched    = run.fetched_count    ?? 0
  const prevInserted   = run.inserted_count   ?? 0
  const prevUpdated    = run.updated_count    ?? 0
  const prevDuplicates = run.duplicate_count  ?? 0
  const prevSkipped    = run.skipped_count    ?? 0

  const totalFetched    = prevFetched    + fetched
  const totalInserted   = prevInserted   + inserted
  const totalUpdated    = prevUpdated    + updated
  const totalDuplicates = prevDuplicates + duplicates
  const totalSkipped    = prevSkipped    + skipped

  const nextOffset  = reachedEnd ? null : currentOffset
  const finalStatus = reachedEnd ? 'completed' : (errorMessage ? 'partial' : 'partial')

  await db.from('import_runs').update({
    status:          finalStatus,
    fetched_count:   totalFetched,
    inserted_count:  totalInserted,
    updated_count:   totalUpdated,
    duplicate_count: totalDuplicates,
    skipped_count:   totalSkipped,
    error_message:   reachedEnd
      ? null
      : (errorMessage ?? `Checkpoint at offset ${nextOffset}. Resume import to continue.`),
    completed_at:    reachedEnd ? new Date().toISOString() : null,
  }).eq('id', run.id)

  return NextResponse.json({
    // ── Identity ──────────────────────────────────────────────────────────────
    importRunId: run.id,
    status:      finalStatus,   // 'completed' | 'partial'
    nextOffset,                 // null when done; number when more pages remain

    // ── Per-batch counts (this invocation only) ───────────────────────────────
    batchFetched:    fetched,
    batchInserted:   inserted,
    batchUpdated:    updated,
    batchDuplicates: duplicates,
    batchSkipped:    skipped,

    // ── Cumulative totals (across all batches for this run) ───────────────────
    totalFetched,
    totalInserted,
    totalUpdated,
    totalDuplicates,
    totalSkipped,
  })
}
