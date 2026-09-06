/**
 * POST /api/import/sweep/toggle
 *
 * Body: { enabled: boolean }
 * Turns the daily Google automation ON or OFF.
 * Returns: { ok: true, enabled: boolean }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { setSetting } from '@/lib/sweep-state'

export const maxDuration = 5

export async function POST(req: NextRequest) {
  try {
    const { enabled } = await req.json() as { enabled: boolean }
    await setSetting('google_daily_search_enabled', enabled ? 'true' : 'false')
    return NextResponse.json({ ok: true, enabled })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
