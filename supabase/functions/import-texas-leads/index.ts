// Supabase Edge Function — import-texas-leads
// Deno runtime. Do not use Node.js imports.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TEXAS_API = 'https://data.texas.gov/resource/jrea-zgmq.json'
const PAGE_SIZE = 1000
const MAX_RECORDS = 10_000
const TIMEOUT_MS = 100_000

const TEXAS_FIELDS = [
  'taxpayer_number','taxpayer_name','taxpayer_address','taxpayer_city',
  'taxpayer_state','taxpayer_zip_code','taxpayer_county_code','taxpayer_organization_type',
  'outlet_number','outlet_name','outlet_address','outlet_city','outlet_state',
  'outlet_zip_code','outlet_county_code','outlet_naics_code',
  'outlet_inside_outside_city_limits_indicator','outlet_permit_issue_date','outlet_first_sales_date',
].join(',')

// ── Allowed county code set (validated against a fixed allowlist)
const VALID_COUNTY_CODES = new Set(['043','057','061','070','111','116','126','129','184','199','213','220','249'])

Deno.serve(async (req) => {
  // ── CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const cronSecret = Deno.env.get('MERCHANT_RADAR_CRON_SECRET')

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let ownerId: string | null = null
  let isScheduled = false

  // ── Authorization
  const authHeader = req.headers.get('Authorization')
  const cronHeader = req.headers.get('x-cron-secret')

  if (cronHeader) {
    // Scheduled invocation
    if (!cronSecret || cronHeader !== cronSecret) {
      return json({ error: 'Unauthorized cron secret' }, 401)
    }
    isScheduled = true
  } else if (authHeader?.startsWith('Bearer ')) {
    // Manual authenticated import
    const token = authHeader.slice(7)
    const userClient = createClient(supabaseUrl, anonKey)
    const { data: { user }, error } = await userClient.auth.getUser(token)
    if (error || !user) return json({ error: 'Unauthorized' }, 401)
    ownerId = user.id
  } else {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── Parse body
  let body: Record<string, string> = {}
  try { body = await req.json() } catch { /* no body */ }
  const requestedTerritoryId: string | null = body.territoryId ?? null

  // ── Load territories to process
  let territoriesQuery = adminClient.from('territories').select('*').eq('is_active', true)
  if (isScheduled) {
    // Process all active territories for all users
  } else if (ownerId) {
    territoriesQuery = territoriesQuery.eq('owner_id', ownerId)
    if (requestedTerritoryId) {
      territoriesQuery = territoriesQuery.eq('id', requestedTerritoryId)
    }
  }

  const { data: territories, error: terrErr } = await territoriesQuery
  if (terrErr || !territories?.length) {
    return json({ error: 'No active territories found', detail: terrErr?.message }, 404)
  }

  const results = []

  for (const territory of territories) {
    const result = await importForTerritory({
      territory,
      adminClient,
      ownerId: territory.owner_id,
    })
    results.push(result)
  }

  if (!isScheduled && results.length === 1) {
    // Single territory — return run directly for UI
    return json({ run: results[0] })
  }
  return json({ results })
})

interface Territory {
  id: string
  owner_id: string
  name: string
  county_codes: string[]
  days_to_import: number
}

async function importForTerritory({ territory, adminClient, ownerId }: {
  territory: Territory
  adminClient: ReturnType<typeof createClient>
  ownerId: string
}) {
  // Validate county codes against allowlist
  const validCodes = territory.county_codes.filter(c => VALID_COUNTY_CODES.has(c))
  if (!validCodes.length) {
    return { error: 'No valid county codes', territory_id: territory.id }
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - territory.days_to_import)
  const cutoffStr = cutoffDate.toISOString().slice(0, 10) + 'T00:00:00.000'

  // Create import run record
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

  if (runErr || !run) return { error: 'Failed to create import run' }

  let fetched = 0, inserted = 0, updated = 0, duplicates = 0, skipped = 0
  let errorMessage: string | null = null

  try {
    // Build the county code IN filter using SoQL — only valid codes, never raw user input
    const countyFilter = validCodes.map(c => `outlet_county_code='${c}'`).join(' OR ')
    const whereClause = `outlet_permit_issue_date >= '${cutoffStr}' AND (${countyFilter})`

    let offset = 0
    let done = false

    const abortAt = Date.now() + TIMEOUT_MS

    while (!done && fetched < MAX_RECORDS) {
      if (Date.now() > abortAt) {
        errorMessage = `Timeout after ${fetched} records`
        break
      }

      const params = new URLSearchParams({
        '$select': TEXAS_FIELDS,
        '$where': whereClause,
        '$order': 'outlet_permit_issue_date ASC,taxpayer_number,outlet_number',
        '$limit': String(PAGE_SIZE),
        '$offset': String(offset),
      })

      const resp = await fetch(`${TEXAS_API}?${params.toString()}`, {
        signal: AbortSignal.timeout(30_000),
      })

      if (!resp.ok) {
        errorMessage = `Texas API error ${resp.status}: ${await resp.text()}`
        break
      }

      const page: Record<string, string>[] = await resp.json()
      fetched += page.length

      if (page.length < PAGE_SIZE) done = true
      offset += PAGE_SIZE

      // Process each record
      for (const raw of page) {
        const taxpayerNum = normalize(raw.taxpayer_number)
        const outletNum = normalize(raw.outlet_number)
        const permitDate = parseDate(raw.outlet_permit_issue_date)
        const outletCounty = normalize(raw.outlet_county_code)

        // Required field checks
        if (!taxpayerNum || !outletNum) { skipped++; continue }
        if (!permitDate) { skipped++; continue }
        if (!outletCounty || !VALID_COUNTY_CODES.has(outletCounty)) { skipped++; continue }

        const firstSalesDate = parseDate(raw.outlet_first_sales_date)
        const outletName = normalize(raw.outlet_name)
        const taxpayerName = normalize(raw.taxpayer_name)
        const displayName = outletName ?? taxpayerName ?? null

        // Score the lead
        const { scoreLead } = await import('./scoring.ts').catch(() => ({ scoreLead: null }))
        let score = 35, priority = 'low', scoreReasons: string[] = []
        if (scoreLead) {
          const result = scoreLead({
            naicsCode: normalize(raw.outlet_naics_code),
            permitIssueDate: permitDate,
            firstSalesDate,
            businessName: displayName,
            outletAddress: normalize(raw.outlet_address),
            taxpayerOrganizationType: normalize(raw.taxpayer_organization_type),
          })
          score = result.score
          priority = result.priority
          scoreReasons = result.reasons
        }

        const sourceRecord = {
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

        // Check if exists — using the unique constraint
        const { data: existing } = await adminClient
          .from('leads')
          .select('id,primary_phone,primary_email,website,owner_name,contact_title,status,score,priority')
          .eq('owner_id', ownerId)
          .eq('source', 'texas_sales_tax_permits')
          .eq('taxpayer_number', taxpayerNum)
          .eq('outlet_number', outletNum)
          .single()

        if (existing) {
          // Update source fields only — never overwrite CRM fields
          await adminClient
            .from('leads')
            .update({
              ...sourceRecord,
              // Recalculate score only if no manual override (use existing score if status is advanced)
              score: ['won','appointment','connected'].includes(existing.status) ? existing.score : score,
              priority: ['won','appointment','connected'].includes(existing.status) ? existing.priority : priority,
              score_reasons: scoreReasons,
            })
            .eq('id', existing.id)
          updated++
        } else {
          // New lead
          const { error: insertErr } = await adminClient
            .from('leads')
            .insert({
              owner_id: ownerId,
              territory_id: territory.id,
              source: 'texas_sales_tax_permits',
              ...sourceRecord,
              display_name: displayName,
              score,
              priority,
              score_reasons: scoreReasons,
              status: 'new',
              starred: false,
            })

          if (insertErr) {
            if (insertErr.code === '23505') { duplicates++; continue } // unique violation
            skipped++
          } else {
            inserted++
          }
        }
      }
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  return s === '' ? null : s
}

function parseDate(v: string | null | undefined): string | null {
  if (!v) return null
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch { return null }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
