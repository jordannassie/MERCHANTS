/**
 * POST /api/admin/logout
 * Clears the signed session cookie and returns to the landing page.
 */
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, cookieOptions } from '@/lib/session'

export async function POST() {
  const res = NextResponse.json({ success: true })
  // Overwrite cookie with an expired, empty value
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0))
  return res
}
