/**
 * Server-only session helpers (Node.js runtime).
 * Never import from client components or middleware — use session-edge.ts there.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'crypto'

export const SESSION_COOKIE = 'mr_admin'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s || s.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must be set and at least 32 characters')
  }
  return s
}

/** Create a signed session token: base64url(payload).base64url(hmac) */
export function createSessionToken(): string {
  const payload = JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + SESSION_DURATION_MS,
    jti: randomBytes(16).toString('hex'),
    v: 1,
  })
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

/** Verify the signature and expiry of a session token. */
export function verifySessionToken(token: string): boolean {
  try {
    const dotIdx = token.indexOf('.')
    if (dotIdx === -1) return false
    const payloadB64 = token.slice(0, dotIdx)
    const sig = token.slice(dotIdx + 1)

    const expectedSig = createHmac('sha256', getSecret()).update(payloadB64).digest('base64url')
    const sigBuf = Buffer.from(sig, 'base64url')
    const expBuf = Buffer.from(expectedSig, 'base64url')
    if (sigBuf.length !== expBuf.length) return false
    if (!timingSafeEqual(sigBuf, expBuf)) return false

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      exp?: number
    }
    return typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

/** Standard cookie options for the session cookie. */
export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
