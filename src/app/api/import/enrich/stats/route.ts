/**
 * GET /api/import/enrich/stats
 *
 * Returns today's enrichment quota status and queue size.
 * Used by the panel to decide whether a run is possible and how many leads to process.
 *
 * Returns:
 * {
 *   daily_limit: number,          // configured (default 100)
 *   used_today: number,           // google_search_runs inserted today
 *   available_today: number,      // daily_limit - used_today (min 0)
 *   queue_size: number,           // State leads with no phone, not recently attempted
 *   retry_eligible: number,       // leads where last attempt > 30 days ago
 *   found_all_time: number,       // ever-enriched (google_enrichment_result = 'found')
 *   callable_gain_today: number,  // leads set to 'both' today
 * }
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 10

const DAILY_LIMIT = Number(process.env.ENRICH_DAILY_LIMIT ?? 100)
const RETRY_DAYS  = 30   // re-attempt leads not found after this many days

export async function GET() {
  const db  = createServiceClient()
  const now = new Date()

  // Start of today in UTC
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()

  // Start of retry window
  const retryBefore = new Date(now.getTime() - RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [
    usedTodayResult,
    queueResult,
    retryResult,
    foundAllTimeResult,
    callableGainResult,
  ] = await Promise.all([
    // Searches used today (each enrichment step inserts one google_search_run)
    db.from('google_search_runs')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', todayStart),

    // State leads with no phone, never attempted
    db.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'texas_sales_tax_permits')
      .eq('lead_source_label', 'state')
      .is('google_enrichment_attempted_at', null)
      .or('permit_phone.is.null,permit_phone.eq.')
      .or('primary_phone.is.null,primary_phone.eq.')
      .not('outlet_name', 'is', null),

    // State leads not found but eligible for retry
    db.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'texas_sales_tax_permits')
      .in('google_enrichment_result', ['not_found', 'no_phone', 'error'])
      .lt('google_enrichment_attempted_at', retryBefore)
      .or('permit_phone.is.null,permit_phone.eq.')
      .or('primary_phone.is.null,primary_phone.eq.'),

    // All-time enrichment successes
    db.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('google_enrichment_result', 'found'),

    // Leads made callable today (enriched to 'both' today)
    db.from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('lead_source_label', 'both')
      .gte('google_enrichment_attempted_at', todayStart),
  ])

  const usedToday     = usedTodayResult.count ?? 0
  const queueSize     = queueResult.count ?? 0
  const retryEligible = retryResult.count ?? 0
  const foundAllTime  = foundAllTimeResult.count ?? 0
  const callableGain  = callableGainResult.count ?? 0
  const available     = Math.max(0, DAILY_LIMIT - usedToday)

  return NextResponse.json({
    daily_limit:         DAILY_LIMIT,
    used_today:          usedToday,
    available_today:     available,
    queue_size:          queueSize,
    retry_eligible:      retryEligible,
    total_enrichable:    queueSize + retryEligible,
    found_all_time:      foundAllTime,
    callable_gain_today: callableGain,
  })
}
