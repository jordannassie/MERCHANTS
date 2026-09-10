/**
 * POST /api/leads/[id]/opt-out
 *
 * Manually opt a lead out of all SMS communication (admin DNC action).
 * Requires mr_admin session cookie.
 *
 * Body (optional JSON): { reason?: string }
 *
 * Effects:
 *   - Sets status = 'do_not_contact'
 *   - Sets opted_out_at = now(), opt_out_source = 'admin'
 *   - Sets opt_out_reason if provided
 *   - Clears next_follow_up_at, sets followup_completed_at = now()
 *   - Adds phone to sms_suppression (so re-imported duplicates are also suppressed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'
import { isValidUSPhone, normalizeUSPhone } from '@/lib/source-utils'

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const db = createServiceClient()

  // Parse optional body
  let body: { reason?: string } = {}
  try {
    body = await req.json()
  } catch {
    // empty / non-JSON body is fine
  }

  const now = new Date().toISOString()

  // Fetch lead to get phone numbers
  const { data: lead, error: leadError } = await db
    .from('leads')
    .select('id, permit_phone, primary_phone, status')
    .eq('id', id)
    .maybeSingle()

  if (leadError || !lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  // Update lead
  const { error: updateError } = await db
    .from('leads')
    .update({
      status:               'do_not_contact',
      opted_out_at:         now,
      opt_out_source:       'admin',
      opt_out_reason:       body.reason ?? null,
      next_follow_up_at:    null,
      followup_completed_at: now,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
  }

  // Add phone to sms_suppression (best-effort — both permit and primary)
  const phones = [lead.permit_phone, lead.primary_phone].filter(Boolean) as string[]
  for (const phone of phones) {
    if (!isValidUSPhone(phone)) continue
    const normalizedPhone = normalizeUSPhone(phone)
    await db
      .from('sms_suppression')
      .upsert(
        {
          normalized_phone: normalizedPhone,
          lead_id:          id,
          opt_out_reason:   body.reason ?? 'Admin DNC',
          opted_out_at:     now,
        },
        { onConflict: 'normalized_phone' },
      )
      .then(({ error }) => {
        if (error) console.error('[opt-out] Failed to add phone to suppression:', normalizedPhone, error)
      })
  }

  return NextResponse.json({ ok: true })
}
