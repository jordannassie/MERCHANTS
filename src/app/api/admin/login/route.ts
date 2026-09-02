/**
 * POST /api/admin/login
 *
 * Verifies the admin PIN server-side using a timing-safe comparison.
 * On success, sets a signed HttpOnly session cookie.
 * Never returns, logs, or exposes the PIN value.
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createSessionToken, SESSION_COOKIE, cookieOptions } from '@/lib/session'

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Per-process (acceptable for single-user CRM; adds meaningful friction even
// in serverless where state may reset between cold starts).
const attempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function clientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function rateCheck(ip: string): { allowed: boolean; waitMs: number } {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS })
    return { allowed: true, waitMs: 0 }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, waitMs: entry.resetAt - now }
  }
  return { allowed: true, waitMs: 0 }
}

function recordFailure(ip: string) {
  const now = Date.now()
  const entry = attempts.get(ip) ?? { count: 0, resetAt: now + WINDOW_MS }
  entry.count++
  attempts.set(ip, entry)
}

function clearAttempts(ip: string) {
  attempts.delete(ip)
}

export async function POST(req: NextRequest) {
  // ── Configuration check ─────────────────────────────────────────────────────
  const adminPin = process.env.ADMIN_PIN
  const sessionSecret = process.env.ADMIN_SESSION_SECRET

  if (!adminPin) {
    return NextResponse.json(
      {
        error: 'config_error',
        message:
          'Admin login is not configured. Set ADMIN_PIN in Netlify environment variables.',
      },
      { status: 503 },
    )
  }
  if (!sessionSecret || sessionSecret.length < 32) {
    return NextResponse.json(
      {
        error: 'config_error',
        message:
          'Session secret is not configured. Set ADMIN_SESSION_SECRET (≥32 chars) in Netlify environment variables.',
      },
      { status: 503 },
    )
  }

  // ── Rate limiting ───────────────────────────────────────────────────────────
  const ip = clientIP(req)
  const { allowed, waitMs } = rateCheck(ip)
  if (!allowed) {
    const waitMin = Math.ceil(waitMs / 60_000)
    return NextResponse.json(
      {
        error: 'rate_limited',
        message: `Too many failed attempts. Try again in ${waitMin} minute${waitMin !== 1 ? 's' : ''}.`,
        waitMs,
      },
      { status: 429 },
    )
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let pin = ''
  try {
    const body = (await req.json()) as Record<string, unknown>
    pin = String(body.pin ?? '')
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // ── Timing-safe PIN comparison ──────────────────────────────────────────────
  // Both buffers must be the same length for timingSafeEqual.
  // Pad to max length so the comparison time doesn't leak the PIN length.
  const len = Math.max(pin.length, adminPin.length)
  const aBuf = Buffer.alloc(len, 0)
  const bBuf = Buffer.alloc(len, 0)
  Buffer.from(pin).copy(aBuf)
  Buffer.from(adminPin).copy(bBuf)

  // Separately check length equality to avoid accepting any PIN when adminPin
  // is a prefix of pin (or vice versa) due to the padding.
  const match = pin.length === adminPin.length && timingSafeEqual(aBuf, bBuf)

  if (!match) {
    recordFailure(ip)
    return NextResponse.json(
      { error: 'incorrect_pin', message: 'Incorrect PIN. Please try again.' },
      { status: 401 },
    )
  }

  // ── Create session ──────────────────────────────────────────────────────────
  clearAttempts(ip)
  let token: string
  try {
    token = createSessionToken()
  } catch (err) {
    console.error('[admin/login] failed to create session token:', err)
    return NextResponse.json({ error: 'session_error', message: 'Could not create session.' }, { status: 500 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(7 * 24 * 60 * 60))
  return res
}
