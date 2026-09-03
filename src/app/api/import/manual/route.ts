import { NextResponse } from 'next/server'
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
 * Number of records per API page.
 * Socrata supports up to 50 000 — use 5 000 so each page is fast.
 */
const PAGE_SIZE = 5_000

/**
 * Wall-clock budget (ms) for a single import request.
 * We leave ~5 s of headroom inside a Netlify 26-second function limit.
 * When the budget expires we record how many records were imported and
 * the caller can hit the endpoint again to continue (additive / idempotent).
 */
const BUDGET_MS = 20_000

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

export async function POST() {
  if (importInProgress) {
    return NextResponse.json(
      { error: 'An import is already running. Please wait a moment and try again.' },
      { status: 429 }
    )
  }

  const db = createServiceClient()

  // Mark any import runs stuck in 'running' for > 30 min as failed.
  try {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    await db
      .from('import_runs')
      .update({
        status: 'failed',
        error_message: 'Import timed out — marked stale',
        completed_at: new Date().toISOString(),
      })
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

  // Use territory days_to_import for the date cutoff; no county restriction.
  const cutoffIso = buildCutoffIso(territory.days_to_import)
  const whereClause = buildSoQLWhereStatewide(cutoffIso)

  // Create import run record (statewide = empty county_codes array)
  const { data: run, error: runErr } = await db
    .from('import_runs')
    .insert({
      territory_id: territory.id,
      source: 'texas_sales_tax_permits',
      status: 'running',
      requested_start_date: cutoffIso.slice(0, 10),
      county_codes: [],          // statewide — no county restriction
    })
    .select()
    .single()

  if (runErr || !run) {
    const detail = runErr
      ? [runErr.message, runErr.code, runErr.details].filter(Boolean).join(' | ')
      : 'unknown'
    console.error('[import/manual] Failed to create import run:', detail)
    return NextResponse.json({ error: 'Failed to create import run.' }, { status: 500 })
  }

  importInProgress = true
  let fetched = 0, inserted = 0, updated = 0, duplicates = 0, skipped = 0
  let errorMessage: string | null = null

  try {
    let offset = 0
    const deadline = Date.now() + BUDGET_MS

    // Fetch pages until API returns empty or budget expires
    while (true) {
      if (Date.now() > deadline) {
        errorMessage = `Time budget reached after ${fetched.toLocaleString()} records. ` +
          `${inserted} new, ${updated} updated. Run import again to continue.`
        break
      }

      const params = new URLSearchParams({
        '$select': TEXAS_FIELDS,
        '$where':  whereClause,
        '$order':  'outlet_permit_issue_date ASC,taxpayer_number,outlet_number',
        '$limit':  String(PAGE_SIZE),
        '$offset': String(offset),
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

      // Batch-lookup existing leads for this page to avoid N individual queries
      const taxpayerOutletPairs = page
        .map(raw => ({
          taxpayerNum: normalize(raw.taxpayer_number),
          outletNum:   normalize(raw.outlet_number),
        }))
        .filter(p => p.taxpayerNum && p.outletNum)

      const uniqueTaxpayers = [...new Set(taxpayerOutletPairs.map(p => p.taxpayerNum!))]

      interface ExistingLead { id: string; taxpayer_number: string; outlet_number: string | null; status: string; score: number; priority: string }
      const existingLeads: ExistingLead[] = []

      // Chunk taxpayer lookups so we don't blow the URL length limit
      const CHUNK = 200
      for (let i = 0; i < uniqueTaxpayers.length; i += CHUNK) {
        const chunk = uniqueTaxpayers.slice(i, i + CHUNK)
        const { data } = await db
          .from('leads')
          .select('id, taxpayer_number, outlet_number, status, score, priority')
          .eq('source', 'texas_sales_tax_permits')
          .in('taxpayer_number', chunk)
        if (data) existingLeads.push(...(data as ExistingLead[]))
      }

      // Build a fast lookup: "taxpayer_number|outlet_number" → lead
      const existingMap = new Map<string, ExistingLead>()
      for (const lead of existingLeads) {
        if (!lead.taxpayer_number || !lead.outlet_number) continue
        existingMap.set(`${lead.taxpayer_number}|${lead.outlet_number}`, lead)
      }

      // Process each record in the page
      const toInsert: Record<string, unknown>[] = []

      for (const raw of page) {
        const taxpayerNum = normalize(raw.taxpayer_number)
        const outletNum   = normalize(raw.outlet_number)
        const permitDate  = parseDate(raw.outlet_permit_issue_date)
        const outletCounty = normalize(raw.outlet_county_code)

        // Must have canonical keys + permit date + a county code
        if (!taxpayerNum || !outletNum || !permitDate || !outletCounty) {
          skipped++
          continue
        }

        const firstSalesDate = parseDate(raw.outlet_first_sales_date)
        const outletName  = normalize(raw.outlet_name)
        const taxpayerName = normalize(raw.taxpayer_name)
        const displayName  = outletName ?? taxpayerName ?? null

        const scored = scoreLead({
          naicsCode:               normalize(raw.outlet_naics_code),
          permitIssueDate:         permitDate,
          firstSalesDate,
          businessName:            displayName,
          outletName,
          taxpayerName,
          outletAddress:           normalize(raw.outlet_address),
          taxpayerOrganizationType: normalize(raw.taxpayer_organization_type),
        })

        const sourceFields = {
          taxpayer_number:              taxpayerNum,
          outlet_number:                outletNum,
          taxpayer_name:                taxpayerName,
          taxpayer_address:             normalize(raw.taxpayer_address),
          taxpayer_city:                normalize(raw.taxpayer_city),
          taxpayer_state:               normalize(raw.taxpayer_state),
          taxpayer_zip:                 normalize(raw.taxpayer_zip_code),
          taxpayer_county_code:         normalize(raw.taxpayer_county_code),
          taxpayer_organization_type:   normalize(raw.taxpayer_organization_type),
          outlet_name:                  outletName,
          outlet_address:               normalize(raw.outlet_address),
          outlet_city:                  normalize(raw.outlet_city),
          outlet_state:                 normalize(raw.outlet_state),
          outlet_zip:                   normalize(raw.outlet_zip_code),
          outlet_county_code:           outletCounty,
          naics_code:                   normalize(raw.outlet_naics_code),
          inside_outside_city:          normalize(raw.outlet_inside_outside_city_limits_indicator),
          permit_issue_date:            permitDate,
          first_sales_date:             firstSalesDate,
          raw_record:                   raw,
          last_seen_at:                 new Date().toISOString(),
        }

        const key = `${taxpayerNum}|${outletNum}`
        const existing = existingMap.get(key)

        if (existing) {
          // Update only non-CRM fields; preserve status/score for progressed leads
          const advanced = new Set(['connected', 'follow_up', 'appointment', 'won'])
          const { error: upErr } = await db
            .from('leads')
            .update({
              ...sourceFields,
              display_name: displayName,
              score:         advanced.has(existing.status) ? existing.score   : scored.score,
              priority:      advanced.has(existing.status) ? existing.priority : scored.priority,
              score_reasons: scored.reasons,
              category:      scored.category ?? undefined,
            })
            .eq('id', existing.id)

          if (upErr) { skipped++; continue }
          updated++
        } else {
          // Queue for bulk insert
          toInsert.push({
            territory_id:  territory.id,
            source:        'texas_sales_tax_permits',
            ...sourceFields,
            display_name:  displayName,
            score:         scored.score,
            priority:      scored.priority,
            score_reasons: scored.reasons,
            category:      scored.category ?? undefined,
            status:        'new',
            starred:       false,
          })
        }
      }

      // Bulk insert new records in sub-batches of 200
      const INSERT_BATCH = 200
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert.slice(i, i + INSERT_BATCH)
        const { error: insErr, data: insData } = await db
          .from('leads')
          .insert(batch)
          .select('id')

        if (insErr) {
          if (insErr.code === '23505') {
            duplicates += batch.length
          } else {
            console.error('[import/manual] batch insert error:', insErr.message)
            skipped += batch.length
          }
        } else {
          inserted += insData?.length ?? batch.length
        }
      }

      // End of data
      if (page.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e)
  } finally {
    importInProgress = false
  }

  const finalStatus = errorMessage
    ? inserted + updated > 0 ? 'partial' : 'failed'
    : 'completed'

  await db.from('import_runs').update({
    status:          finalStatus,
    fetched_count:   fetched,
    inserted_count:  inserted,
    updated_count:   updated,
    duplicate_count: duplicates,
    skipped_count:   skipped,
    error_message:   errorMessage,
    completed_at:    new Date().toISOString(),
  }).eq('id', run.id)

  return NextResponse.json({
    run: {
      id:              run.id,
      status:          finalStatus,
      fetched_count:   fetched,
      inserted_count:  inserted,
      updated_count:   updated,
      duplicate_count: duplicates,
      skipped_count:   skipped,
      error_message:   errorMessage,
    },
  })
}
