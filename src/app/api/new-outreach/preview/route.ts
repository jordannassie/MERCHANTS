/**
 * GET /api/new-outreach/preview
 * Renders the exact Initial SMS for the next eligible NEW lead (or ?leadId=).
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'
import { getEligibleNewLeads } from '@/lib/new-outreach-engine'
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

  const db = createServiceClient()
  const leadId = req.nextUrl.searchParams.get('leadId')

  let lead: {
    id: string
    display_name?: string | null
    outlet_name?: string | null
    taxpayer_name?: string | null
    outlet_city?: string | null
  } | null = null

  if (leadId) {
    const { data } = await db
      .from('leads')
      .select('id,display_name,outlet_name,taxpayer_name,outlet_city')
      .eq('id', leadId)
      .maybeSingle()
    lead = data
  } else {
    const eligible = await getEligibleNewLeads(db, 1)
    lead = eligible[0] ?? null
  }

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'No eligible lead to preview' }, { status: 404 })
  }

  const rendered = await renderInitialSmsForLead(db, lead)
  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    displayName: lead.display_name || lead.outlet_name || lead.taxpayer_name,
    ...rendered,
  })
}
