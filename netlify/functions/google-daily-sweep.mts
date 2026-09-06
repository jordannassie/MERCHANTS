/**
 * Netlify Scheduled Function — Google Daily Leads
 *
 * Runs once per day at 12:00 UTC (7:00 AM CDT / 6:00 AM CST).
 * Google's daily quota resets at midnight Pacific (≈ 08:00 UTC),
 * so 12:00 UTC gives a 4-hour buffer before this function fires.
 *
 * What it does:
 *   1. Calls POST /api/import/sweep/run-batch on this site
 *   2. run-batch processes up to MAX_TASKS_PER_BATCH (5) tasks
 *   3. Progress is saved to Supabase after every task
 *   4. If quota is hit, the sweep pauses at the current position
 *   5. Tomorrow's run resumes from exactly where today's stopped
 *
 * Safety:
 *   - run-batch respects GOOGLE_DAILY_SEARCH_LIMIT (default 90)
 *   - If automation is turned OFF, run-batch returns immediately
 *   - On quota_exceeded: does NOT advance task position
 *   - Never logs or exposes the Google API key
 *
 * Required env vars (set in Netlify → Site configuration → Environment variables):
 *   GOOGLE_MAPS_API_KEY      — Google Places API (New) key
 *   URL                      — set automatically by Netlify (your site URL)
 *
 * Optional:
 *   GOOGLE_DAILY_SEARCH_LIMIT  — max searches per day (default 90)
 *
 * Schedule: "0 12 * * *" = 12:00 UTC daily
 */

import { schedule } from '@netlify/functions'

const handler = schedule('0 12 * * *', async () => {
  const siteUrl = process.env.URL ?? ''

  if (!siteUrl) {
    console.error('[google-daily-sweep] Cannot determine site URL — URL env var not set by Netlify')
    return { statusCode: 500 }
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.log('[google-daily-sweep] GOOGLE_MAPS_API_KEY not set — skipping')
    return { statusCode: 200 }
  }

  console.log(`[google-daily-sweep] Starting daily batch at ${new Date().toISOString()}`)

  try {
    const res = await fetch(`${siteUrl}/api/import/sweep/run-batch`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      // 24-second timeout — run-batch hard-stops at 20s internally
      signal:  AbortSignal.timeout(24_000),
    })

    const result = await res.json() as {
      tasks_processed: number
      new_leads:       number
      enriched:        number
      searches_used:   number
      stopped_reason:  string
      error?:          string
    }

    console.log(
      `[google-daily-sweep] Batch complete: ` +
      `tasks=${result.tasks_processed} new_leads=${result.new_leads} enriched=${result.enriched} ` +
      `searches=${result.searches_used} stopped=${result.stopped_reason}` +
      (result.error ? ` error="${result.error}"` : '')
    )

    if (result.stopped_reason === 'quota_exceeded') {
      console.log('[google-daily-sweep] Daily quota reached — sweep paused. Resumes tomorrow at 12:00 UTC.')
    } else if (result.stopped_reason === 'goal_reached') {
      console.log(`[google-daily-sweep] Daily goal reached: ${result.new_leads} new callable leads added.`)
    } else if (result.stopped_reason === 'disabled') {
      console.log('[google-daily-sweep] Automation is OFF — no searches performed.')
    } else if (result.stopped_reason === 'all_done') {
      console.log('[google-daily-sweep] Full Texas cycle complete! New cycle started.')
    }

    return { statusCode: 200 }
  } catch (err) {
    console.error('[google-daily-sweep] Error calling run-batch:', err)
    return { statusCode: 500 }
  }
})

export { handler }
