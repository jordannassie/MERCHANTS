/**
 * GET /api/admin/session
 * Returns whether the current request carries a valid admin session.
 * Used by the landing page to decide whether to redirect to /dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const authenticated = token ? verifySessionToken(token) : false
  return NextResponse.json({ authenticated })
}
