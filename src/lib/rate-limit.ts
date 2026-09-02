/**
 * Server-side rate limiting for enrichment endpoints.
 * Uses enrichment_jobs as a persistent counter — works across all serverless instances.
 *
 * Limits (rolling window):
 *   enrich   — 50 single-lead Google Places calls per 15 minutes
 *   bulk     — 3 bulk batch calls per 30 minutes
 *   research — 20 OpenAI research calls per 60 minutes
 *
 * Single-workspace internal tool — no per-user tracking needed.
 * GOOGLE_MAPS_API_KEY and OPENAI_API_KEY are never exposed to the browser.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type RateLimitKey = 'enrich' | 'bulk' | 'research'

const LIMITS: Record<RateLimitKey, { max: number; windowMinutes: number }> = {
  enrich:   { max: 50, windowMinutes: 15 },
  bulk:     { max: 3,  windowMinutes: 30 },
  research: { max: 20, windowMinutes: 60 },
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: string
  limit: number
  used: number
}

/**
 * Check rate limit using enrichment_jobs as a durable counter.
 * Graceful: if the count query fails, allows the request through.
 */
export async function checkRateLimit(
  db: SupabaseClient,
  key: RateLimitKey
): Promise<RateLimitResult> {
  const { max, windowMinutes } = LIMITS[key]
  const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const resetAt = new Date(Date.now() + windowMinutes * 60_000).toISOString()

  // Map each key to a source string stored in enrichment_jobs.raw_response
  const sourceByKey: Record<RateLimitKey, string> = {
    enrich:   'google_places',
    bulk:     'google_places',          // bulk writes the same source
    research: 'openai_web_research',
  }
  const source = sourceByKey[key]

  const { count, error } = await db
    .from('enrichment_jobs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', windowStart)
    .eq('raw_response->>source' as 'status', source)  // jsonb path filter

  if (error) {
    // Don't block the request if rate-limit counting fails
    console.warn('[rate-limit] count error:', error.message)
    return { allowed: true, remaining: max, resetAt, limit: max, used: 0 }
  }

  const used = count ?? 0
  return {
    allowed: used < max,
    remaining: Math.max(0, max - used),
    resetAt,
    limit: max,
    used,
  }
}

/** Build a 429 NextResponse for rate limit exceeded */
export function rateLimitExceeded(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: `Rate limit exceeded. ${result.used}/${result.limit} requests used in this window. Try again after ${new Date(result.resetAt).toLocaleTimeString()}.`,
      limit: result.limit,
      used: result.used,
      remaining: 0,
      resetAt: result.resetAt,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt,
        'Retry-After': String(Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000)),
      },
    }
  )
}
