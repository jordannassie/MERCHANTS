/**
 * GET  /api/settings/sales-followup — returns { enabled: boolean }
 * POST /api/settings/sales-followup — body { enabled: boolean } → upserts system_settings
 *
 * Auth: requires mr_admin session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'

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
  const { data } = await db
    .from('system_settings')
    .select('value')
    .eq('key', 'sales_followup_enabled')
    .maybeSingle()

  return NextResponse.json({ enabled: data?.value === 'true' })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let enabled: boolean
  try {
    const body = await req.json()
    enabled = Boolean(body.enabled)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const db = createServiceClient()
  const { error } = await db
    .from('system_settings')
    .upsert(
      { key: 'sales_followup_enabled', value: enabled ? 'true' : 'false', updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) {
    console.error('[settings/sales-followup] DB error:', error)
    return NextResponse.json({ ok: false, error: 'Failed to update setting' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, enabled })
}

// PATCH is an alias for POST
export { POST as PATCH }
