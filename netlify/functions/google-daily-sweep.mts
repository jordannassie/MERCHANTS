/**
 * Netlify Scheduled Function — Google Daily Leads
 *
 * Runs hourly during Texas business hours: 14:00–23:00 UTC (9 AM–6 PM CDT).
 * Each invocation calls POST /api/import/sweep/run-batch which processes up to
 * MAX_TASKS_PER_BATCH (20) tasks, saves progress to Supabase, and returns.
 *
 * Hourly execution allows the 20-task batches to progress through the full 315-task
 * Texas cycle across the day instead of being capped to a single daily fire.
 *
 * What it does:
 *   1. Calls POST /api/import/sweep/run-batch on this site
 *   2. run-batch processes up to MAX_TASKS_PER_BATCH (20) tasks
 *   3. Progress is saved to Supabase after every task
 *   4. If quota is hit, the sweep pauses at the current position
 *   5. The next hourly run resumes from exactly where the previous one stopped
 *
 * Safety:
 *   - If automation is turned OFF, run-batch returns immediately
 *   - On quota_exceeded from Google API: does NOT advance task position
 *   - Never logs or exposes the Google API key
 *
 * Required env vars (set in Netlify → Site configuration → Environment variables):
 *   GOOGLE_MAPS_API_KEY      — Google Places API (New) key
 *   URL                      — set automatically by Netlify (your site URL)
 *
 * Schedule: "0 14-23 * * *" = hourly 14:00–23:00 UTC (9 AM–6 PM CDT)
 */

import { schedule } from '@netlify/functions'

const handler = schedule('0 14-23 * * *', async () => {
  const siteUrl = process.env.URL ?? ''

  if (!siteUrl) {
    console.error('[google-daily-sweep] Cannot determine site URL — URL env var not set by Netlify')
    return { statusCode: 500 }
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.log('[google-daily-sweep] GOOGLE_MAPS_API_KEY not set — skipping')
    return { statusCode: 200 }
  }

  console.log(`[google-daily-sweep] Starting hourly batch at ${new Date().toISOString()}`)

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
      console.log('[google-daily-sweep] Google API quota reached — sweep paused. Resumes next hourly run.')
    } else if (result.stopped_reason === 'batch_limit') {
      console.log(`[google-daily-sweep] Batch limit reached: ${result.tasks_processed} tasks processed, ${result.new_leads} new leads added.`)
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
