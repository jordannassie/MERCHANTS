import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ensureWorkspaceTerritory } from '@/lib/workspace'
import { scoreLead } from '@/lib/scoring'
import {
  normalize,
  parseDate,
  validateCountyCodes,
  buildSoQLWhere,
  buildCutoffIso,
  DFW_COUNTY_ALLOWLIST,
} from '@/lib/importer-utils'

const TEXAS_API = 'https://data.texas.gov/resource/jrea-zgmq.json'
const PAGE_SIZE = 1000
const MAX_RECORDS = 10_000

const TEXAS_FIELDS = [
  'taxpayer_number', 'taxpayer_name', 'taxpayer_address', 'taxpayer_city',
  'taxpayer_state', 'taxpayer_zip_code', 'taxpayer_county_code',
  'taxpayer_organization_type', 'outlet_number', 'outlet_name',
  'outlet_address', 'outlet_city', 'outlet_state', 'outlet_zip_code',
  'outlet_county_code', 'outlet_naics_code',
  'outlet_inside_outside_city_limits_indicator',
  'outlet_permit_issue_date', 'outlet_first_sales_date',
].join(',')

// Simple in-memory rate limit: one import at a time
let importInProgress = false

export async function POST() {
  if (importInProgress) {
    return NextResponse.json(
      { error: 'An import is already running. Please wait.' },
      { status: 429 }
    )
  }

  const db = createServiceClient()
  let territory: Awaited<ReturnType<typeof ensureWorkspaceTerritory>>

  try {
    territory = await ensureWorkspaceTerritory()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[import/manual] territory error:', msg)
    return NextResponse.json({ error: `Territory not ready: ${msg}` }, { status: 500 })
  }

  const validCodes = validateCountyCodes(territory.county_codes, DFW_COUNTY_ALLOWLIST)
  if (!validCodes.length) {
    return NextResponse.json({ error: 'No valid county codes in territory.' }, { status: 400 })
  }

  const cutoffIso = buildCutoffIso(territory.days_to_import)
  const whereClause = buildSoQLWhere(cutoffIso, validCodes)

  // Create import run record
  const { data: run, error: runErr } = await db
    .from('import_runs')
    .insert({
      territory_id: territory.id,
      source: 'texas_sales_tax_permits',
      status: 'running',
      requested_start_date: cutoffIso.slice(0, 10),
      county_codes: validCodes,
    })
    .select()
    .single()

  if (runErr || !run) {
    const detail = runErr ? [runErr.message, runErr.code, runErr.details].filter(Boolean).join(' | ') : 'unknown'
    console.error('[import/manual] Failed to create import run:', detail)
    return NextResponse.json({ error: 'Failed to create import run.' }, { status: 500 })
  }

  importInProgress = true
  let fetched = 0, inserted = 0, updated = 0, duplicates = 0, skipped = 0
  let errorMessage: string | null = null

  try {
    let offset = 0
    const abortAt = Date.now() + 90_000 // 90s server-side timeout

    while (fetched < MAX_RECORDS) {
      if (Date.now() > abortAt) {
        errorMessage = `Timed out after ${fetched} records`
        break
      }

      const params = new URLSearchParams({
        '$select': TEXAS_FIELDS,
        '$where': whereClause,
        '$order': 'outlet_permit_issue_date ASC,taxpayer_number,outlet_number',
        '$limit': String(PAGE_SIZE),
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

      for (const raw of page) {
        const taxpayerNum = normalize(raw.taxpayer_number)
        const outletNum = normalize(raw.outlet_number)
        const permitDate = parseDate(raw.outlet_permit_issue_date)
        const outletCounty = normalize(raw.outlet_county_code)

        if (
          !taxpayerNum || !outletNum || !permitDate ||
          !outletCounty || !DFW_COUNTY_ALLOWLIST.has(outletCounty)
        ) {
          skipped++
          continue
        }

        const firstSalesDate = parseDate(raw.outlet_first_sales_date)
        const outletName = normalize(raw.outlet_name)
        const taxpayerName = normalize(raw.taxpayer_name)
        const displayName = outletName ?? taxpayerName ?? null

        const scored = scoreLead({
          naicsCode: normalize(raw.outlet_naics_code),
          permitIssueDate: permitDate,
          firstSalesDate,
          businessName: displayName,
          outletName: outletName,
          taxpayerName: taxpayerName,
          outletAddress: normalize(raw.outlet_address),
          taxpayerOrganizationType: normalize(raw.taxpayer_organization_type),
        })

        const sourceFields = {
          taxpayer_number: taxpayerNum,
          outlet_number: outletNum,
          taxpayer_name: taxpayerName,
          taxpayer_address: normalize(raw.taxpayer_address),
          taxpayer_city: normalize(raw.taxpayer_city),
          taxpayer_state: normalize(raw.taxpayer_state),
          taxpayer_zip: normalize(raw.taxpayer_zip_code),
          taxpayer_county_code: normalize(raw.taxpayer_county_code),
          taxpayer_organization_type: normalize(raw.taxpayer_organization_type),
          outlet_name: outletName,
          outlet_address: normalize(raw.outlet_address),
          outlet_city: normalize(raw.outlet_city),
          outlet_state: normalize(raw.outlet_state),
          outlet_zip: normalize(raw.outlet_zip_code),
          outlet_county_code: outletCounty,
          naics_code: normalize(raw.outlet_naics_code),
          inside_outside_city: normalize(raw.outlet_inside_outside_city_limits_indicator),
          permit_issue_date: permitDate,
          first_sales_date: firstSalesDate,
          raw_record: raw,
          last_seen_at: new Date().toISOString(),
        }

        // Check for existing lead (idempotent upsert)
        const { data: existing } = await db
          .from('leads')
          .select('id,status,score,priority')
          .eq('source', 'texas_sales_tax_permits')
          .eq('taxpayer_number', taxpayerNum)
          .eq('outlet_number', outletNum)
          .maybeSingle()

        if (existing) {
          // Don't overwrite score/priority if lead is already progressed
          const advanced = new Set(['connected', 'follow_up', 'appointment', 'won'])
          const { error: upErr } = await db
            .from('leads')
            .update({
              ...sourceFields,
              score: advanced.has(existing.status) ? existing.score : scored.score,
              priority: advanced.has(existing.status) ? existing.priority : scored.priority,
              score_reasons: scored.reasons,
              category: scored.category ?? undefined,
            })
            .eq('id', existing.id)

          if (upErr) {
            skipped++
            continue
          }
          updated++
        } else {
          const { error: insErr } = await db.from('leads').insert({
            territory_id: territory.id,
            source: 'texas_sales_tax_permits',
            ...sourceFields,
            display_name: displayName,
            score: scored.score,
            priority: scored.priority,
            score_reasons: scored.reasons,
            category: scored.category ?? undefined,
            status: 'new',
            starred: false,
          })

          if (insErr) {
            if (insErr.code === '23505') {
              duplicates++
              continue
            }
            skipped++
          } else {
            inserted++
          }
        }
      }

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
    status: finalStatus,
    fetched_count: fetched,
    inserted_count: inserted,
    updated_count: updated,
    duplicate_count: duplicates,
    skipped_count: skipped,
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  }).eq('id', run.id)

  return NextResponse.json({
    run: {
      id: run.id,
      status: finalStatus,
      fetched_count: fetched,
      inserted_count: inserted,
      updated_count: updated,
      duplicate_count: duplicates,
      skipped_count: skipped,
      error_message: errorMessage,
    },
  })
}
