/**
 * Next.js Edge Middleware — protects all private CRM routes.
 *
 * Session cookie is verified using the Web Crypto API (available in Edge Runtime).
 * Never imports Node.js crypto — uses crypto.subtle instead.
 */
import { NextRequest, NextResponse } from 'next/server'

const COOKIE = 'mr_admin'

// Pages that require a valid session (prefix match)
const PROTECTED_PAGES = [
  '/dashboard',
  '/leads',
  '/pipeline',
  '/follow-ups',
  '/settings',
  '/follow-ups',
]

// API routes that require a valid session (prefix match)
const PROTECTED_APIS = [
  '/api/leads',
  '/api/activities',
  '/api/contacts',
  '/api/enrich',
  '/api/import',
  '/api/workspace',
  '/api/admin/migration-status',
]

// Routes that are always public — never blocked
const ALWAYS_PUBLIC = [
  '/api/admin/login',
  '/api/admin/logout',
  '/api/admin/session',
  '/_next',
  '/favicon',
  '/login',
  '/auth',
  '/setup',
  '/signup',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow public prefixes without touching the session
  if (ALWAYS_PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const isProtectedPage = PROTECTED_PAGES.some(
    p => pathname === p || pathname.startsWith(p + '/'),
  )
  const isProtectedApi = PROTECTED_APIS.some(p => pathname.startsWith(p))

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next()
  }

  // Verify session
  const token = request.cookies.get(COOKIE)?.value
  const valid = token ? await verifySession(token) : false

  if (!valid) {
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Valid admin session required.' },
        { status: 401 },
      )
    }
    // Redirect to landing page with ?login=1 to auto-open the PIN dialog
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = '?login=1'
    return NextResponse.redirect(url)
  }

  // Authenticated — prevent the browser from caching private pages
  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate')
  res.headers.set('Pragma', 'no-cache')
  return res
}

// ─── Edge-compatible session verification ────────────────────────────────────

async function verifySession(token: string): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 32) return false

  try {
    const dotIdx = token.indexOf('.')
    if (dotIdx === -1) return false

    const payloadPart = token.slice(0, dotIdx)
    const sigPart = token.slice(dotIdx + 1)

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const sigBytes = base64urlToBytes(sigPart)
    const payloadBytes = new TextEncoder().encode(payloadPart)
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes.buffer as ArrayBuffer, payloadBytes)
    if (!valid) return false

    const payloadJson = new TextDecoder().decode(base64urlToBytes(payloadPart))
    const payload = JSON.parse(payloadJson) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

function base64urlToBytes(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const config = {
  matcher: [
    // Match everything except Next.js internals, static files, and known public assets
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|webm|woff2?|ttf|otf)).*)',
  ],
}
