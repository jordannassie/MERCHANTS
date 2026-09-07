/**
 * POST /api/new-outreach/send-batch
 * Body: { confirmed: true }
 *
 * Manually triggers one batch of initial outreach SMS sends.
 * Requires explicit { confirmed: true } to prevent accidental sends.
 *
 * Auth: requires mr_admin session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'
import { getNewOutreachSettings, processBatch } from '@/lib/new-outreach-engine'

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { confirmed?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  // Require explicit confirmation to prevent accidental sends
  if (!body.confirmed) {
    return NextResponse.json(
      { ok: false, error: 'Must send { confirmed: true } to trigger batch' },
      { status: 400 },
    )
  }

  if (!process.env.QUO_API_KEY) {
    return NextResponse.json({ ok: false, error: 'SMS is not configured' }, { status: 503 })
  }

  const db = createServiceClient()
  const settings = await getNewOutreachSettings(db)
  const result = await processBatch(db, settings.batchSize)

  return NextResponse.json({
    ok: true,
    requested: result.requested,
    sent:      result.sent,
    failed:    result.failed,
    skipped:   result.skipped,
    errors:    result.errors,
  })
}
