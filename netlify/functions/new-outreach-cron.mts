/**
 * Netlify Scheduled Function — New Outreach Automation
 *
 * Runs hourly from 13:00–22:00 UTC (8 AM–5 PM CDT) to catch the configured send time.
 * Uses maybeRunScheduledBatch() which prevents duplicate sends via lastRunDate check.
 *
 * What it does:
 *   1. Checks if new_outreach_enabled = 'true' in system_settings
 *   2. Checks if already ran today (new_outreach_last_run_date == today in CT)
 *   3. Checks if current CT time >= new_outreach_send_time
 *   4. If all checks pass: sends initial proposal SMS to up to new_outreach_batch_size NEW leads
 *   5. Enrolls each successful lead in the automated follow-up sequence
 *
 * Safety:
 *   - Idempotent: only runs once per day (lastRunDate guard)
 *   - Checks suppression list before every send
 *   - Skips leads already enrolled (followup_started_at IS NULL guard)
 *   - No artificial volume cap — batchSize is the user-configured authority
 *   - Default is OFF — must be enabled in Dashboard
 *
 * Required env vars:
 *   QUO_API_KEY          — QUO SMS API key
 *   QUO_FROM_NUMBER      — Sender phone number
 *   SUPABASE_URL         — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 *
 * Schedule: "0 13-22 * * *" = hourly 8 AM–5 PM CDT
 */

import { schedule } from '@netlify/functions'
import { createServiceClient } from '../../src/lib/supabase/service'
import { maybeRunScheduledBatch } from '../../src/lib/new-outreach-engine'

const handler = schedule('0 13-22 * * *', async () => {
  console.log(`[new-outreach-cron] Starting at ${new Date().toISOString()}`)

  if (!process.env.QUO_API_KEY) {
    console.log('[new-outreach-cron] QUO_API_KEY not set — skipping')
    return { statusCode: 200 }
  }

  try {
    const db = createServiceClient()
    const outcome = await maybeRunScheduledBatch(db)

    if (!outcome.ran) {
      console.log(`[new-outreach-cron] Skipped — reason: ${outcome.reason}`)
      return { statusCode: 200 }
    }

    const r = outcome.result!
    console.log(
      `[new-outreach-cron] Complete: ` +
      `requested=${r.requested} sent=${r.sent} failed=${r.failed} skipped=${r.skipped}`,
    )
    if (r.errors.length > 0) {
      console.warn(`[new-outreach-cron] Errors:`, r.errors.slice(0, 10))
    }

    return { statusCode: 200 }
  } catch (err) {
    console.error('[new-outreach-cron] Unexpected error:', err)
    return { statusCode: 500 }
  }
})

export { handler }
