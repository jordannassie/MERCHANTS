/**
 * Server-side rate limiting for enrichment endpoints.
 *
 * Internal rate limits have been removed — all enrichment requests are allowed through.
 * The function signatures are preserved so callers do not need to change.
 *
 * Retained stubs:
 *   - checkRateLimit — always returns { allowed: true }
 *   - rateLimitExceeded — kept for type safety but should never be reached
 */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RateLimitKey = 'enrich' | 'bulk' | 'research' | 'entity'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: string
  waitSeconds: number
  limit: number
  used: number
}

/**
 * All internal enrichment rate limits removed.
 * Always returns allowed: true — external provider errors (429s) are handled by each caller.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function checkRateLimit(
  _db: SupabaseClient,
  _key: RateLimitKey
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + 60_000).toISOString()
  return { allowed: true, remaining: 9999, resetAt, waitSeconds: 60, limit: 9999, used: 0 }
}

/** Stub — internal rate limits removed. This should never be called since checkRateLimit always returns allowed: true. */
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
    { status: 429 }
  )
}
