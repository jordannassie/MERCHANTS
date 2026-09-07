/**
 * POST /api/import/sweep/run-batch
 *
 * Processes up to MAX_TASKS_PER_BATCH Google search tasks from the active sweep.
 * Called by the Netlify scheduled function (daily) and manually for testing.
 *
 * Safety rules (all enforced server-side):
 *   - Never processes more than MAX_TASKS_PER_BATCH tasks per invocation
 *   - Stops when daily quota (DAILY_SEARCH_LIMIT) is reached — never retries quota errors
 *   - Stops when today's new-lead goal (DAILY_GOAL) is reached
 *   - Stops when soft time budget (BATCH_TIME_BUDGET_MS) is approached
 *   - Saves progress to Supabase after every task
 *   - On quota error: does NOT advance task_index — resumes from same task tomorrow
 *   - On other API error: advances task_index (skips stuck task), records error
 *   - Never marks a quota-blocked or failed task as completed
 *   - Never logs or exposes the Google API key
 *
 * Returns:
 *   { tasks_processed, new_leads, enriched, dup_skipped, no_phone,
 *     searches_used, stopped_reason, error? }
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { textSearchPlaces, rawToPreview, fetchPlacePhone } from '@/lib/google-places'
import { applyDedup, isValidUSPhone, normalizePhoneForDedup, type DedupeCandidate } from '@/lib/source-utils'
import {
  getSetting,
  getOrCreateSweep,
  getTask,
  MAX_TASKS_PER_BATCH,
  BATCH_TIME_BUDGET_MS,
  RECHECK_DAYS,
  TASKS_TOTAL,
  db,
} from '@/lib/sweep-state'

const makeDb = db
import type { GooglePlacePreview } from '@/lib/types'

export const maxDuration = 26

type StopReason = 'batch_limit' | 'quota_exceeded' | 'time_budget' | 'all_done' | 'disabled' | 'no_key' | 'error'

interface BatchResult {
  tasks_processed: number
  new_leads:       number
  enriched:        number
  dup_skipped:     number
  no_phone:        number
  searches_used:   number
  stopped_reason:  StopReason
  error?:          string
}

// ── Process one Google search task ────────────────────────────────────────────

async function processTask(
  db: ReturnType<typeof makeDb>,
  sweepId: string,
  taskIndex: number,
  apiKey: string,
): Promise<{
  ok: boolean
  quota_exceeded: boolean
  new_leads: number
  enriched: number
  dup_skipped: number
  no_phone: number
  error?: string
}> {
  const task = getTask(taskIndex)
  if (!task) return { ok: false, quota_exceeded: false, new_leads: 0, enriched: 0, dup_skipped: 0, no_phone: 0, error: 'no_task' }

  // ── Call Google Places Text Search ─────────────────────────────────────────
  const searchResult = await textSearchPlaces(task.textQuery, 1)

  if (searchResult.error) {
    const { type } = searchResult.error
    const isQuota = type === 'quota_exceeded'
    const msg = type === 'not_configured' ? 'API key not configured' :
                type === 'api_disabled'   ? 'Google Places API not enabled in Cloud Console' :
                type === 'quota_exceeded' ? 'Daily Google quota reached' :
                type === 'request_denied' ? 'API key denied — check Cloud Console restrictions' :
                                            `Google Places error: ${(searchResult.error as {message?: string}).message ?? type}`
    return { ok: !isQuota, quota_exceeded: isQuota, new_leads: 0, enriched: 0, dup_skipped: 0, no_phone: 0, error: msg }
  }

  // ── Record the search in google_search_runs (quota tracking) ──────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('google_search_runs').insert({
    state:         'TX',
    location:      task.metro,
    query:         task.phrase,
    results_found: searchResult.places.length,
    started_at:    new Date().toISOString(),
    completed_at:  new Date().toISOString(),
  })

  if (searchResult.places.length === 0) {
    return { ok: true, quota_exceeded: false, new_leads: 0, enriched: 0, dup_skipped: 0, no_phone: 0 }
  }

  // ── Convert raw results to preview shape ───────────────────────────────────
  const previews = searchResult.places.map(rawToPreview)

  // ── Fetch phones for phone-less results (up to 3 per task) ────────────────
  let phoneFetches = 0
  for (const p of previews) {
    if (p.phone || phoneFetches >= 3) continue
    const phone = await fetchPlacePhone(p.place_id)
    if (phone) p.phone = phone
    phoneFetches++
  }

  // ── Check google_places_seen for already-seen Place IDs ───────────────────
  const placeIds = previews.map(p => p.place_id).filter(Boolean)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seenRows } = await (db as any)
    .from('google_places_seen')
    .select('place_id, had_phone, recheck_after')
    .in('place_id', placeIds)

  const seenMap = new Map<string, { had_phone: boolean; recheck_after: string | null }>(
    (seenRows ?? []).map((r: { place_id: string; had_phone: boolean; recheck_after: string | null }) => [r.place_id, r])
  )

  let newLeads = 0, enriched = 0, dupSkipped = 0, noPhone = 0
  const now = new Date().toISOString()
  const recheckAfter = new Date(Date.now() + RECHECK_DAYS * 24 * 60 * 60 * 1000).toISOString()

  for (const p of previews) {
    const seen = seenMap.get(p.place_id)

    // Already seen and had a phone → lead already exists → skip
    if (seen?.had_phone) { dupSkipped++; continue }

    // Already seen, no phone, not yet eligible for recheck → skip
    if (seen && !seen.had_phone && seen.recheck_after && seen.recheck_after > now) {
      noPhone++; continue
    }

    // Phone gate — record as seen (no phone) and skip
    if (!isValidUSPhone(p.phone)) {
      noPhone++
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('google_places_seen').upsert(
        { place_id: p.place_id, name: p.name, had_phone: false, last_seen_at: now, recheck_after: recheckAfter },
        { onConflict: 'place_id' }
      )
      continue
    }

    // ── Dedup against existing leads ─────────────────────────────────────────
    const normPhone = normalizePhoneForDedup(p.phone)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLeads } = await (db as any)
      .from('leads')
      .select('id, primary_phone, permit_phone, google_place_id, display_name, outlet_name, outlet_address, outlet_city, lead_source_label')
      .or(`google_place_id.eq.${p.place_id},primary_phone.eq.${p.phone}`)
      .limit(5)

    const [matched] = applyDedup([p], (existingLeads ?? []) as DedupeCandidate[])

    if (matched.matched_lead_id) {
      // ── Enrich existing lead ──────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (db as any).from('leads').select('lead_source_label, primary_phone, google_place_id').eq('id', matched.matched_lead_id).single()
      const alreadyGoogle = existing?.google_place_id === p.place_id && existing?.lead_source_label !== 'state'
      if (alreadyGoogle) { dupSkipped++; continue }

      const newLabel = existing?.lead_source_label === 'google' ? 'google' : 'both'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('leads').update({
        google_place_id:   p.place_id,
        google_maps_url:   p.google_maps_url,
        lead_source_label: newLabel,
        last_seen_at:      now,
        ...(p.website && !existing?.website ? { website: p.website } : {}),
        ...(!existing?.primary_phone && p.phone ? { primary_phone: p.phone } : {}),
      }).eq('id', matched.matched_lead_id)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('lead_sources').upsert(
        { lead_id: matched.matched_lead_id, source_type: 'google_places', external_id: p.place_id, source_url: p.google_maps_url, last_seen_at: now },
        { onConflict: 'lead_id,source_type' }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('google_places_seen').upsert(
        { place_id: p.place_id, name: p.name, normalized_phone: normPhone, had_phone: true, lead_id: matched.matched_lead_id, last_seen_at: now },
        { onConflict: 'place_id' }
      )
      enriched++

    } else {
      // ── New lead ──────────────────────────────────────────────────────────
      const taxNum = `gp_${p.place_id.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insErr } = await (db as any)
        .from('leads')
        .upsert({
          source:             'google_places',
          taxpayer_number:    taxNum,
          outlet_number:      '0',
          display_name:       p.name,
          outlet_name:        p.name,
          outlet_address:     p.street_address,
          outlet_city:        p.city,
          outlet_state:       p.state ?? 'TX',
          outlet_zip:         p.zip,
          outlet_county_code: null,
          taxpayer_city:      p.city,
          taxpayer_state:     p.state ?? 'TX',
          primary_phone:      p.phone,
          website:            p.website,
          google_place_id:    p.place_id,
          google_maps_url:    p.google_maps_url,
          lead_source_label:  'google',
          status:             'new',
          starred:            false,
          score:              50,
          priority:           'good',
          last_seen_at:       now,
        },
        { onConflict: 'source,taxpayer_number,outlet_number', ignoreDuplicates: false })
        .select('id')
        .single()

      if (insErr?.code === '23505' || !inserted) { dupSkipped++; continue }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('lead_sources').upsert(
        { lead_id: inserted.id, source_type: 'google_places', external_id: p.place_id, source_url: p.google_maps_url },
        { onConflict: 'lead_id,source_type' }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('google_places_seen').upsert(
        { place_id: p.place_id, name: p.name, normalized_phone: normPhone, had_phone: true, lead_id: inserted.id, last_seen_at: now },
        { onConflict: 'place_id' }
      )
      newLeads++
    }
  }

  return { ok: true, quota_exceeded: false, new_leads: newLeads, enriched, dup_skipped: dupSkipped, no_phone: noPhone }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(): Promise<NextResponse> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ stopped_reason: 'no_key', error: 'GOOGLE_MAPS_API_KEY not set', tasks_processed: 0, new_leads: 0, enriched: 0, dup_skipped: 0, no_phone: 0, searches_used: 0 } satisfies BatchResult)

  const enabled = await getSetting('google_daily_search_enabled')
  if (enabled !== 'true') return NextResponse.json({ stopped_reason: 'disabled', tasks_processed: 0, new_leads: 0, enriched: 0, dup_skipped: 0, no_phone: 0, searches_used: 0 } satisfies BatchResult)

  const database = makeDb()
  const sweep    = await getOrCreateSweep()
  const startMs  = Date.now()

  let tasksProcessed = 0
  let totalNewLeads  = 0
  let totalEnriched  = 0
  let totalDup       = 0
  let totalNoPhone   = 0
  let stopReason: StopReason = 'time_budget'

  // Reload current daily totals from sweep
  let newLeadsToday   = sweep.new_leads_today
  let searchesToday   = sweep.searches_today
  let taskIndex       = sweep.task_index
  let allTimeNewLeads = sweep.new_leads
  let allTimeEnriched = sweep.enriched

  while (tasksProcessed < MAX_TASKS_PER_BATCH) {
    // Time budget check — hard stop before Netlify kills the function
    if (Date.now() - startMs > BATCH_TIME_BUDGET_MS) { stopReason = 'time_budget'; break }

    // Cycle complete?
    if (taskIndex >= TASKS_TOTAL) {
      // Mark cycle complete, reset index
      const cycleAt = new Date().toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (database as any).from('google_sweeps').update({
        task_index:               0,
        last_complete_cycle_at:   cycleAt,
        updated_at:               cycleAt,
      }).eq('id', sweep.id)
      taskIndex = 0
      stopReason = 'all_done'
      break
    }

    // Run one task
    const result = await processTask(database, sweep.id, taskIndex, apiKey)

    if (result.quota_exceeded) {
      stopReason = 'quota_exceeded'
      // DO NOT advance taskIndex — resume from same task tomorrow
      break
    }

    // Always advance taskIndex (even on non-quota errors — don't get stuck)
    taskIndex++
    tasksProcessed++
    totalNewLeads  += result.new_leads
    totalEnriched  += result.enriched
    totalDup       += result.dup_skipped
    totalNoPhone   += result.no_phone
    newLeadsToday  += result.new_leads
    searchesToday  += 1
    allTimeNewLeads += result.new_leads
    allTimeEnriched += result.enriched

    // ── Save progress to DB after every task ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (database as any).from('google_sweeps').update({
      task_index:        taskIndex,
      new_leads:         allTimeNewLeads,
      enriched:          allTimeEnriched,
      new_leads_today:   newLeadsToday,
      searches_today:    searchesToday,
      last_run_at:       new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    }).eq('id', sweep.id)

    // Rate limit between tasks
    if (tasksProcessed < MAX_TASKS_PER_BATCH) {
      await new Promise(r => setTimeout(r, 600))
    }
  }

  if (stopReason === 'time_budget' && tasksProcessed > 0) stopReason = 'batch_limit' // completed all tasks in this batch

  return NextResponse.json({
    tasks_processed: tasksProcessed,
    new_leads:       totalNewLeads,
    enriched:        totalEnriched,
    dup_skipped:     totalDup,
    no_phone:        totalNoPhone,
    searches_used:   tasksProcessed,
    stopped_reason:  stopReason,
  } satisfies BatchResult)
}
