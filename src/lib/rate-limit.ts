/**
 * Server-side rate limiting for enrichment endpoints.
 * Uses enrichment_jobs as a persistent counter — works across all serverless instances.
 *
 * Limits (rolling window):
 *   enrich   — 50 single-lead Google Places calls per 15 minutes
 *   bulk     — 3 bulk batch calls per 30 minutes
 *   research — 20 OpenAI research calls per 60 minutes
 *   entity   — 200 CPA entity lookups per 60 minutes (CPA API is free)
 *
 * Single-workspace internal tool — no per-user tracking needed.
 * API keys are never exposed to the browser.
 */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RateLimitKey = 'enrich' | 'bulk' | 'research' | 'entity'

const LIMITS: Record<RateLimitKey, { max: number; windowMinutes: number }> = {
  enrich:   { max: 50,  windowMinutes: 15 },
  bulk:     { max: 3,   windowMinutes: 30 },
  research: { max: 20,  windowMinutes: 60 },
  entity:   { max: 200, windowMinutes: 60 }, // CPA API is free; generous limit
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: string
  waitSeconds: number
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
  const windowWaitSeconds = Math.ceil(windowMinutes * 60)

  const sourceByKey: Record<RateLimitKey, string> = {
    enrich:   'google_places',
    bulk:     'google_places',
    research: 'openai_web_research',
    entity:   'cpa_entity_lookup',
  }
  const source = sourceByKey[key]

  const { count, error } = await db
    .from('enrichment_jobs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', windowStart)
    .eq('raw_response->>source' as 'status', source)

  if (error) {
    console.warn('[rate-limit] count error:', error.message)
    return { allowed: true, remaining: max, resetAt, waitSeconds: windowWaitSeconds, limit: max, used: 0 }
  }

  const used = count ?? 0
  const resetMs = new Date(resetAt).getTime() - Date.now()
  return {
    allowed: used < max,
    remaining: Math.max(0, max - used),
    resetAt,
    waitSeconds: Math.ceil(resetMs / 1000),
    limit: max,
    used,
  }
}

/** Build a 429 NextResponse for rate limit exceeded — includes errorCode and waitSeconds */
export function rateLimitExceeded(result: RateLimitResult): NextResponse {
  const waitMin = Math.ceil(result.waitSeconds / 60)
  return NextResponse.json(
    {
      errorCode: 'internal_rate_limit',
      error: `Rate limit reached — ${result.used}/${result.limit} lookups in this window. Try again in ${waitMin} minute${waitMin === 1 ? '' : 's'}.`,
      waitSeconds: result.waitSeconds,
      resetAt: result.resetAt,
      remaining: result.remaining,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt,
        'Retry-After': String(result.waitSeconds),
      },
    }
  )
}
