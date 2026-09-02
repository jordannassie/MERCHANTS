/**
 * Netlify Scheduled Function — Daily SIFT Permit Phone Import
 *
 * Runs once per day, after midnight Texas time, to pull the latest
 * stpMM-DDph.zip from the Texas Comptroller SIFT API and save permit
 * phone numbers to matched leads.
 *
 * The heavy lifting is all done in /api/import/sift-auto (a Next.js
 * API route). This function just triggers it and logs the result.
 *
 * Schedule: "0 7 * * *" = 07:00 UTC = 02:00 CDT / 01:00 CST
 * (Texas publishes new weekly files on Mondays; daily attempts are
 * idempotent because sift_import_log caches the last filename.)
 *
 * Required env vars (set in Netlify → Site configuration → Env vars):
 *   CPA_SIFT_API_KEY  — SIFT API key (separate from CPA_API_KEY)
 *   URL               — set automatically by Netlify (your site URL)
 */

import { schedule } from '@netlify/functions'

const handler = schedule('0 7 * * *', async () => {
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') ?? ''

  if (!siteUrl) {
    console.error('[sift-cron] Cannot determine site URL — URL env var not set')
    return { statusCode: 500 }
  }

  if (!process.env.CPA_SIFT_API_KEY) {
    console.log('[sift-cron] CPA_SIFT_API_KEY not set — skipping auto-import')
    return { statusCode: 200 }
  }

  const targetUrl = siteUrl.startsWith('http')
    ? `${siteUrl}/api/import/sift-auto`
    : `https://${siteUrl}/api/import/sift-auto`

  console.log(`[sift-cron] Triggering import at ${targetUrl}`)

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false }),
      signal: AbortSignal.timeout(300_000), // 5-minute timeout
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error(`[sift-cron] Import returned HTTP ${res.status}:`, body)
      return { statusCode: res.status }
    }

    if (body.cached) {
      console.log(`[sift-cron] ${body.filename} already imported — skipping`)
    } else {
      const s = body.summary ?? {}
      console.log(
        `[sift-cron] ✓ Imported ${body.filename}: ` +
        `${s.rowsParsed ?? 0} rows, ${s.leadsMatched ?? 0} matched, ` +
        `${s.phonesAdded ?? 0} phones saved`
      )
    }

    return { statusCode: 200 }
  } catch (err) {
    console.error('[sift-cron] Fetch error:', err)
    return { statusCode: 500 }
  }
})

export { handler }
