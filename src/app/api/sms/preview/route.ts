/**
 * GET /api/sms/preview?leadId=...
 * Returns the exact Initial SMS string that will be saved and sent to QUO.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'
import { renderInitialSmsForLead } from '@/lib/initial-sms'

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const leadId = req.nextUrl.searchParams.get('leadId')
  if (!leadId) {
    return NextResponse.json({ ok: false, error: 'leadId is required' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: lead, error } = await db
    .from('leads')
    .select('id,display_name,outlet_name,taxpayer_name,outlet_city,status,permit_phone,primary_phone')
    .eq('id', leadId)
    .maybeSingle()

  if (error || !lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const rendered = await renderInitialSmsForLead(db, lead)
  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    ...rendered,
  })
}
