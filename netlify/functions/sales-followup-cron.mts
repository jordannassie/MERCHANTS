/**
 * Netlify Scheduled Function — Sales Follow-up Automation
 *
 * Runs hourly from 14:00–23:00 UTC (≈9 AM–6 PM CDT).
 * Sends automated follow-up SMS messages to leads in the sequence.
 *
 * What it does:
 *   1. Checks if sales_followup_enabled = 'true' in system_settings
 *   2. Fetches leads where next_follow_up_at <= now() and followup_completed_at IS NULL
 *   3. For each eligible lead, sends the next follow-up step via QUO
 *   4. Updates lead state (followup_step, last_followup_sent_at, next_follow_up_at)
 *
 * Safety:
 *   - Checks suppression list before every send
 *   - Stops per-lead on STOP/DNC, won/lost, agreement_requested/accepted
 *   - No artificial daily volume cap — provider (QUO) is the authority
 *   - Default is OFF — must be enabled in Dashboard
 *
 * Required env vars:
 *   QUO_API_KEY         — QUO SMS API key
 *   QUO_FROM_NUMBER     — Sender phone number
 *   SUPABASE_URL        — Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key
 *
 * Schedule: "0 14-23 * * *" = hourly 9 AM–6 PM CDT
 */

import { schedule } from '@netlify/functions'
import { createServiceClient } from '../../src/lib/supabase/service'
import { processDueLeads } from '../../src/lib/followup-engine'

const handler = schedule('0 14-23 * * *', async () => {
  console.log(`[sales-followup-cron] Starting at ${new Date().toISOString()}`)

  if (!process.env.QUO_API_KEY) {
    console.log('[sales-followup-cron] QUO_API_KEY not set — skipping')
    return { statusCode: 200 }
  }

  try {
    const db = createServiceClient()
    const result = await processDueLeads(db)

    console.log(
      `[sales-followup-cron] Complete: ` +
      `processed=${result.processed} sent=${result.sent} skipped=${result.skipped} errors=${result.errors}`,
    )

    return { statusCode: 200 }
  } catch (err) {
    console.error('[sales-followup-cron] Unexpected error:', err)
    return { statusCode: 500 }
  }
})

export { handler }
