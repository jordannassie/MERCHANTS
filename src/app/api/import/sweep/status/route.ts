/**
 * GET /api/import/sweep/status
 *
 * Returns the complete state for the Google Daily Leads panel:
 * - ON/OFF setting
 * - today's search quota usage
 * - current sweep position (which task)
 * - today's new leads / enriched / skipped
 * - last run / next scheduled run
 * - whether the API key is configured
 */

import { NextResponse } from 'next/server'
import {
  getSetting,
  getOrCreateSweep,
  countSearchesToday,
  nextRunAt,
  DAILY_GOAL,
  DAILY_SEARCH_LIMIT,
  TASKS_TOTAL,
} from '@/lib/sweep-state'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 10

export async function GET() {
  try {
    const [enabled, sweep, searchesToday] = await Promise.all([
      getSetting('google_daily_search_enabled'),
      getOrCreateSweep(),
      countSearchesToday(),
    ])

    const isEnabled = enabled === 'true'

    // Count today's new Google leads from lead_sources
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createServiceClient() as any
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { count: dupSkippedToday } = await db
      .from('google_places_seen')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', todayStart.toISOString())

    return NextResponse.json({
      enabled:                isEnabled,
      api_key_configured:     !!process.env.GOOGLE_MAPS_API_KEY,
      daily_goal:             DAILY_GOAL,
      daily_search_limit:     DAILY_SEARCH_LIMIT,
      searches_used_today:    searchesToday,
      searches_remaining:     Math.max(0, DAILY_SEARCH_LIMIT - searchesToday),
      new_leads_today:        sweep.new_leads_today,
      searches_today:         sweep.searches_today,
      task_index:             sweep.task_index,
      tasks_total:            TASKS_TOTAL,
      new_leads_all_time:     sweep.new_leads,
      enriched_all_time:      sweep.enriched,
      last_run_at:            sweep.last_run_at,
      last_complete_cycle_at: sweep.last_complete_cycle_at,
      next_run_at:            nextRunAt(),
      dup_skipped_today:      dupSkippedToday ?? 0,
      sweep_id:               sweep.id,
    })
  } catch (err) {
    console.error('[sweep/status]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
