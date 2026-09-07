/**
 * GET  /api/new-outreach/settings — returns current settings + eligible count
 * PATCH /api/new-outreach/settings — upserts settings keys
 *
 * Auth: requires mr_admin session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'
import {
  getNewOutreachSettings,
  countEligibleNewLeads,
} from '@/lib/new-outreach-engine'

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const [settings, eligibleCount] = await Promise.all([
    getNewOutreachSettings(db),
    countEligibleNewLeads(db),
  ])

  return NextResponse.json({
    enabled:       settings.enabled,
    batchSize:     settings.batchSize,
    sendTime:      settings.sendTime,
    lastRunDate:   settings.lastRunDate,
    eligibleCount,
  })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { enabled?: boolean; batchSize?: number; sendTime?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const db = createServiceClient()
  const now = new Date().toISOString()
  const upserts: Array<{ key: string; value: string; updated_at: string }> = []

  if (typeof body.enabled === 'boolean') {
    upserts.push({ key: 'new_outreach_enabled', value: body.enabled ? 'true' : 'false', updated_at: now })
  }
  if (typeof body.batchSize === 'number' && body.batchSize > 0) {
    upserts.push({ key: 'new_outreach_batch_size', value: String(Math.floor(body.batchSize)), updated_at: now })
  }
  if (typeof body.sendTime === 'string' && /^\d{1,2}:\d{2}$/.test(body.sendTime)) {
    upserts.push({ key: 'new_outreach_send_time', value: body.sendTime, updated_at: now })
  }

  if (upserts.length === 0) {
    return NextResponse.json({ ok: false, error: 'No valid fields to update' }, { status: 400 })
  }

  for (const row of upserts) {
    const { error } = await db
      .from('system_settings')
      .upsert(row, { onConflict: 'key' })

    if (error) {
      console.error('[new-outreach/settings] DB upsert error:', error)
      return NextResponse.json({ ok: false, error: 'Failed to update setting' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
