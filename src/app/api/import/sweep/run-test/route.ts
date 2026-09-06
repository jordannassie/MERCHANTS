/**
 * POST /api/import/sweep/run-test
 *
 * Runs EXACTLY ONE search task from the current sweep position.
 * Does NOT require automation to be enabled.
 * Does NOT save results to leads — use this to verify connectivity and quota.
 *
 * Stops immediately if:
 *   - GOOGLE_MAPS_API_KEY is not set
 *   - Daily quota is already exhausted
 *   - Google returns quota_exceeded
 *   - Google returns any API error
 *
 * Returns detailed result so the user can verify before enabling automation:
 *   { ok, task_index, metro, phrase, checked, callable, new_leads, enriched,
 *     dup_skipped, no_phone, quota_exceeded, searches_remaining, error? }
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { textSearchPlaces, rawToPreview, fetchPlacePhone } from '@/lib/google-places'
import { applyDedup, isValidUSPhone, type DedupeCandidate } from '@/lib/source-utils'
import {
  getOrCreateSweep,
  countSearchesToday,
  getTask,
  DAILY_SEARCH_LIMIT,
  TASKS_TOTAL,
} from '@/lib/sweep-state'

export const maxDuration = 20

export async function POST() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, quota_exceeded: false, error: 'GOOGLE_MAPS_API_KEY is not configured in environment variables.' })
  }

  const sweep = await getOrCreateSweep()
  const searchesUsedToday = await countSearchesToday()
  const searchesRemaining = Math.max(0, DAILY_SEARCH_LIMIT - searchesUsedToday)

  if (searchesRemaining <= 0) {
    return NextResponse.json({
      ok:                 false,
      quota_exceeded:     true,
      task_index:         sweep.task_index,
      searches_remaining: 0,
      error:              'Daily Google quota reached — resumes tomorrow at 12:00 UTC.',
    })
  }

  const taskIndex = sweep.task_index % TASKS_TOTAL
  const task = getTask(taskIndex)
  if (!task) {
    return NextResponse.json({ ok: false, quota_exceeded: false, error: 'No task found at current position.' })
  }

  // ── Call Google Places ─────────────────────────────────────────────────────
  const searchResult = await textSearchPlaces(task.textQuery, 1)

  if (searchResult.error) {
    const { type } = searchResult.error
    const isQuota = type === 'quota_exceeded'
    const msg = type === 'not_configured'  ? 'GOOGLE_MAPS_API_KEY is not configured.' :
                type === 'api_disabled'    ? 'Google Places API (New) is not enabled in your Google Cloud Console. Enable it at console.cloud.google.com/apis/library then search "Places API (New)".' :
                type === 'quota_exceeded'  ? 'Daily Google quota reached — resumes tomorrow at 12:00 UTC.' :
                type === 'request_denied'  ? 'API key denied — check Google Cloud Console for IP or API restrictions on this key.' :
                                             `Google Places error: ${(searchResult.error as { message?: string }).message ?? type}`
    return NextResponse.json({ ok: !isQuota, quota_exceeded: isQuota, task_index: taskIndex, metro: task.metro, phrase: task.phrase, checked: 0, callable: 0, new_leads: 0, enriched: 0, dup_skipped: 0, no_phone: 0, searches_remaining: isQuota ? 0 : searchesRemaining - 1, error: msg })
  }

  // Record the test search for quota tracking
  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from('google_search_runs').insert({
    state: 'TX', location: task.metro, query: task.phrase, results_found: searchResult.places.length, started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  })

  const checked = searchResult.places.length
  const previews = searchResult.places.map(rawToPreview)

  // Fetch phones for phone-less (up to 2 in test mode)
  let phoneFetches = 0
  for (const p of previews) {
    if (p.phone || phoneFetches >= 2) continue
    const phone = await fetchPlacePhone(p.place_id)
    if (phone) p.phone = phone
    phoneFetches++
  }

  const callable = previews.filter(p => isValidUSPhone(p.phone)).length
  const noPhone  = previews.filter(p => !isValidUSPhone(p.phone)).length

  // Dedup check against existing leads (without importing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placeIds = previews.map(p => p.place_id).filter(Boolean)
  const { data: existingLeads } = await (db as any)
    .from('leads')
    .select('id, primary_phone, permit_phone, google_place_id, display_name, outlet_name, outlet_address, outlet_city, lead_source_label')
    .or(`google_place_id.in.(${placeIds.join(',')})`)
    .limit(50)

  const withDedup = applyDedup(
    previews.filter(p => isValidUSPhone(p.phone)),
    (existingLeads ?? []) as DedupeCandidate[]
  )

  const wouldEnrich  = withDedup.filter(p => p.matched_lead_id && p.match_type !== undefined).length
  const wouldInsert  = withDedup.filter(p => !p.matched_lead_id).length
  const wouldSkipDup = callable - wouldEnrich - wouldInsert

  return NextResponse.json({
    ok:                 true,
    quota_exceeded:     false,
    task_index:         taskIndex,
    metro:              task.metro,
    phrase:             task.phrase,
    checked,
    callable,
    new_leads:          wouldInsert,
    enriched:           wouldEnrich,
    dup_skipped:        Math.max(0, wouldSkipDup),
    no_phone:           noPhone,
    searches_remaining: searchesRemaining - 1,
    note:               'Test only — no leads were imported. Run automation to import.',
  })
}
