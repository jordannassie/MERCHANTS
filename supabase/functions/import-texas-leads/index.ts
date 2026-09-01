// Supabase Edge Function — import-texas-leads
// Deno runtime. Do NOT use Node.js imports.
// Dataset: jrea-zgmq  (Active Sales Tax Permit Holders — Texas Open Data)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { scoreLead } from './scoring.ts'

const TEXAS_API = 'https://data.texas.gov/resource/jrea-zgmq.json'
const PAGE_SIZE = 1000
const MAX_RECORDS = 10_000
const TIMEOUT_MS = 100_000

const TEXAS_FIELDS = [
  'taxpayer_number', 'taxpayer_name', 'taxpayer_address', 'taxpayer_city',
  'taxpayer_state', 'taxpayer_zip_code', 'taxpayer_county_code', 'taxpayer_organization_type',
  'outlet_number', 'outlet_name', 'outlet_address', 'outlet_city', 'outlet_state',
  'outlet_zip_code', 'outlet_county_code', 'outlet_naics_code',
  'outlet_inside_outside_city_limits_indicator', 'outlet_permit_issue_date', 'outlet_first_sales_date',
].join(',')

/**
 * Fixed allowlist of valid DFW-area county codes.
 * County codes are validated against this set — never passed raw from user input into SoQL.
 */
const VALID_COUNTY_CODES = new Set([
  '043', '057', '061', '070', '111', '116', '126', '129', '184', '199', '213', '220', '249',
])

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type',
      },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const cronSecret = Deno.env.get('MERCHANT_RADAR_CRON_SECRET') ?? null

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let ownerId: string | null = null
  let isScheduled = false

  const cronHeader = req.headers.get('x-cron-secret')
  const authHeader = req.headers.get('Authorization')

  if (cronHeader !== null) {
    // ── Scheduled invocation via pg_cron + pg_net
    if (!cronSecret || cronHeader !== cronSecret) {
      return jsonResponse({ error: 'Unauthorized cron secret' }, 401)
    }
    isScheduled = true
  } else if (authHeader?.startsWith('Bearer ')) {
    // ── Manual authenticated import — derive owner ID from verified token only
    const token = authHeader.slice(7)
    const userClient = createClient(supabaseUrl, anonKey)
    const { data: { user }, error } = await userClient.auth.getUser(token)
    if (error || !user) return jsonResponse({ error: 'Unauthorized' }, 401)
    ownerId = user.id
  } else {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: Record<string, string> = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const requestedTerritoryId: string | null = body.territoryId ?? null

  // ── Load territories
  let territoriesQuery = adminClient.from('territories').select('*').eq('is_active', true)
  if (!isScheduled && ownerId) {
    territoriesQuery = territoriesQuery.eq('owner_id', ownerId)
    if (requestedTerritoryId) territoriesQuery = territoriesQuery.eq('id', requestedTerritoryId)
  }

  const { data: territories, error: terrErr } = await territoriesQuery
  if (terrErr || !territories?.length) {
    return jsonResponse({ error: 'No active territories found', detail: terrErr?.message ?? null }, 404)
  }

  const results = []
  for (const territory of territories) {
    const result = await importForTerritory({ territory, adminClient, ownerId: territory.owner_id })
    results.push(result)
  }

  // Single-territory manual import: return the run object directly for the UI
  if (!isScheduled && results.length === 1) {
    return jsonResponse({ run: results[0] })
  }
  return jsonResponse({ results })
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Territory {
  id: string
  owner_id: string
  name: string
  county_codes: string[]
  days_to_import: number
}

type AdminClient = ReturnType<typeof createClient>

// ── Core import logic ─────────────────────────────────────────────────────────

async function importForTerritory({
  territory,
  adminClient,
  ownerId,
}: {
  territory: Territory
  adminClient: AdminClient
  ownerId: string
}) {
  // Validate county codes against the fixed allowlist — never trust raw input
  const validCodes = territory.county_codes.filter(c => VALID_COUNTY_CODES.has(c))
  if (!validCodes.length) {
    return { error: 'No valid county codes in territory', territory_id: territory.id }
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - territory.days_to_import)
  // Use T00:00:00.000 so permits issued on the cutoff day are included
  const cutoffIso = cutoffDate.toISOString().slice(0, 10) + 'T00:00:00.000'

  const { data: run, error: runErr } = await adminClient
    .from('import_runs')
    .insert({
      owner_id: ownerId,
      territory_id: territory.id,
      source: 'texas_sales_tax_permits',
      status: 'running',
      requested_start_date: cutoffDate.toISOString().slice(0, 10),
      county_codes: validCodes,
    })
    .select()
    .single()

  if (runErr || !run) {
    return { error: 'Failed to create import run record', detail: runErr?.message ?? null }
  }

  let fetched = 0, inserted = 0, updated = 0, duplicates = 0, skipped = 0
  let errorMessage: string | null = null

  try {
    /*
     * SoQL WHERE clause uses only:
     *  - a date string derived from territory.days_to_import (integer arithmetic)
     *  - county codes validated against VALID_COUNTY_CODES (fixed string set)
     * No arbitrary user-supplied strings are interpolated.
     */
    const countyFilter = validCodes.map(c => `outlet_county_code='${c}'`).join(' OR ')
    const whereClause = `outlet_permit_issue_date >= '${cutoffIso}' AND (${countyFilter})`

    let offset = 0
    const abortAt = Date.now() + TIMEOUT_MS

    while (fetched < MAX_RECORDS) {
      if (Date.now() > abortAt) {
        errorMessage = `Timed out after fetching ${fetched} records`
        break
      }

      const params = new URLSearchParams({
        '$select': TEXAS_FIELDS,
        '$where': whereClause,
        '$order': 'outlet_permit_issue_date ASC,taxpayer_number,outlet_number',
        '$limit': String(PAGE_SIZE),
        '$offset': String(offset),
      })

      // Sample URL (secrets removed): https://data.texas.gov/resource/jrea-zgmq.json?
      //   $select=taxpayer_number,...&$where=outlet_permit_issue_date+%3E%3D+%272026-08-18T00%3A00%3A00.000%27+AND+%28outlet_county_code%3D%27057%27+OR+...%29&$order=...&$limit=1000&$offset=0
      const resp = await fetch(`${TEXAS_API}?${params.toString()}`, {
        signal: AbortSignal.timeout(30_000),
      })

      if (!resp.ok) {
        errorMessage = `Texas API error HTTP ${resp.status}`
        break
      }

      const page: Record<string, string>[] = await resp.json()
      fetched += page.length

      for (const raw of page) {
        const taxpayerNum = normalize(raw.taxpayer_number)
        const outletNum = normalize(raw.outlet_number)
        const permitDate = parseDate(raw.outlet_permit_issue_date)
        const outletCounty = normalize(raw.outlet_county_code)

        // Required field guards — missing/invalid records are skipped, not failed
        if (!taxpayerNum || !outletNum) { skipped++; continue }
        if (!permitDate) { skipped++; continue }
        if (!outletCounty || !VALID_COUNTY_CODES.has(outletCounty)) { skipped++; continue }

        const firstSalesDate = parseDate(raw.outlet_first_sales_date)
        const outletName = normalize(raw.outlet_name)
        const taxpayerName = normalize(raw.taxpayer_name)
        const displayName = outletName ?? taxpayerName ?? null

        const scoreResult = scoreLead({
          naicsCode: normalize(raw.outlet_naics_code),
          permitIssueDate: permitDate,
          firstSalesDate,
          businessName: displayName,
          outletAddress: normalize(raw.outlet_address),
          taxpayerOrganizationType: normalize(raw.taxpayer_organization_type),
        })

        // Fields that belong to the Texas source record — managed by the importer
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

        // Check for existing lead using the unique (owner, source, taxpayer#, outlet#) index
        const { data: existing } = await adminClient
          .from('leads')
          .select('id,status,score,priority')
          .eq('owner_id', ownerId)
          .eq('source', 'texas_sales_tax_permits')
          .eq('taxpayer_number', taxpayerNum)
          .eq('outlet_number', outletNum)
          .maybeSingle()

        if (existing) {
          /*
           * REIMPORT RULES:
           * - Update all Texas source fields and last_seen_at
           * - Preserve first_imported_at (not touched)
           * - Never overwrite: primary_phone, primary_email, website, owner_name,
           *   contact_title, status, display_name (if set), or next_follow_up_at
           * - Recalculate score only if lead hasn't been advanced past "attempted"
           */
          const advancedStatuses = new Set(['connected', 'follow_up', 'appointment', 'won'])
          const keepScore = advancedStatuses.has(existing.status)

          const { error: updateErr } = await adminClient
            .from('leads')
            .update({
              ...sourceFields,
              score: keepScore ? existing.score : scoreResult.score,
              priority: keepScore ? existing.priority : scoreResult.priority,
              score_reasons: scoreResult.reasons,
            })
            .eq('id', existing.id)

          if (updateErr) { skipped++; continue }
          updated++
        } else {
          const { error: insertErr } = await adminClient
            .from('leads')
            .insert({
              owner_id: ownerId,
              territory_id: territory.id,
              source: 'texas_sales_tax_permits',
              ...sourceFields,
              display_name: displayName,
              score: scoreResult.score,
              priority: scoreResult.priority,
              score_reasons: scoreResult.reasons,
              status: 'new',
              starred: false,
            })

          if (insertErr) {
            if (insertErr.code === '23505') { duplicates++; continue } // unique constraint
            skipped++
          } else {
            inserted++
          }
        }
      }

      // Pagination: stop when page is smaller than PAGE_SIZE
      if (page.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e)
  }

  const finalStatus = errorMessage
    ? (inserted + updated > 0 ? 'partial' : 'failed')
    : 'completed'

  await adminClient
    .from('import_runs')
    .update({
      status: finalStatus,
      fetched_count: fetched,
      inserted_count: inserted,
      updated_count: updated,
      duplicate_count: duplicates,
      skipped_count: skipped,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', run.id)

  return {
    id: run.id,
    status: finalStatus,
    fetched_count: fetched,
    inserted_count: inserted,
    updated_count: updated,
    duplicate_count: duplicates,
    skipped_count: skipped,
    error_message: errorMessage,
    started_at: run.started_at,
    completed_at: new Date().toISOString(),
  }
}

// ── Pure helpers (also exported for testing via importer-utils.ts) ────────────

export function normalize(v: string | null | undefined): string | null {
  if (v == null) return null
  const s = v.trim()
  return s === '' ? null : s
}

export function parseDate(v: string | null | undefined): string | null {
  if (!v) return null
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch { return null }
}

export function buildCutoffIso(daysToImport: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - daysToImport)
  return d.toISOString().slice(0, 10) + 'T00:00:00.000'
}

export function validateCountyCodes(
  codes: string[],
  allowlist: ReadonlySet<string>,
): string[] {
  return codes.filter(c => allowlist.has(c))
}

export function buildSoQLWhere(cutoffIso: string, validCodes: string[]): string {
  const countyFilter = validCodes.map(c => `outlet_county_code='${c}'`).join(' OR ')
  return `outlet_permit_issue_date >= '${cutoffIso}' AND (${countyFilter})`
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
