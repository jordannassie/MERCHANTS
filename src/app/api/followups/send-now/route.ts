/**
 * POST /api/followups/send-now
 * Body: { leadId: string }
 *
 * Manually triggers the next follow-up step for a specific lead.
 * Auth required (mr_admin session cookie).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'
import {
  checkStopConditions,
  buildFollowupMessage,
  enrollLeadInSequence,
} from '@/lib/followup-engine'
import { sendSms, isValidUSPhone, normalizeUSPhone } from '@/lib/quo'
import { getProposalUrl } from '@/lib/proposals'
import type { Lead } from '@/lib/types'

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

const STEP_DELAY_DAYS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let leadId: string
  try {
    const body = await req.json()
    leadId = body.leadId
    if (!leadId) throw new Error('missing leadId')
  } catch {
    return NextResponse.json({ ok: false, error: 'leadId is required' }, { status: 400 })
  }

  if (!process.env.QUO_API_KEY) {
    return NextResponse.json({ ok: false, error: 'SMS is not configured' }, { status: 503 })
  }

  const db = createServiceClient()

  // Fetch lead
  const fetchResult = await db
    .from('leads')
    .select(
      'id,display_name,outlet_name,outlet_city,status,permit_phone,primary_phone,sms_needs_reply,' +
      'proposal_status,followup_step,followup_completed_at,followup_started_at,proposal_slug',
    )
    .eq('id', leadId)
    .single()

  const fetchError = fetchResult.error
  const lead = fetchResult.data as unknown as Lead | null

  if (fetchError || !lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  // Check stop conditions
  const { stop, reason } = checkStopConditions(lead)
  if (stop) {
    return NextResponse.json({ ok: false, error: `Cannot send: ${reason}` }, { status: 422 })
  }

  // Validate phone
  const phone = lead.permit_phone ?? lead.primary_phone
  if (!phone || !isValidUSPhone(phone)) {
    return NextResponse.json({ ok: false, error: 'Lead has no valid phone number' }, { status: 422 })
  }

  const normalizedPhone = normalizeUSPhone(phone)

  // Check suppression
  const { data: suppressed } = await db
    .from('sms_suppression')
    .select('id')
    .eq('normalized_phone', normalizedPhone)
    .maybeSingle()

  if (suppressed) {
    return NextResponse.json(
      { ok: false, error: 'This number has opted out of SMS messages' },
      { status: 422 },
    )
  }

  // Determine step to send
  const currentStep = lead.followup_step ?? 0
  const nextStep = currentStep + 1

  if (nextStep > 3) {
    return NextResponse.json(
      { ok: false, error: 'Follow-up sequence already complete' },
      { status: 422 },
    )
  }

  // Get proposal URL for step 2
  let proposalUrl: string | null = null
  if (nextStep === 2 && lead.proposal_slug) {
    proposalUrl = getProposalUrl(lead.proposal_slug)
  }

  // Fetch the message template for this step from system_settings
  const templateKey = `sales_followup_message_${nextStep}`
  const { data: templateRow } = await db
    .from('system_settings')
    .select('value')
    .eq('key', templateKey)
    .maybeSingle()
  const template = templateRow?.value ?? null

  const businessName = lead.display_name || lead.outlet_name || 'your business'
  const city = (lead as unknown as { outlet_city?: string | null }).outlet_city ?? null
  const message = buildFollowupMessage(nextStep, businessName, proposalUrl, city, template)
  const sentAt = new Date().toISOString()

  try {
    const { messageId } = await sendSms(phone, message)

    // Record in sms_messages
    await db.from('sms_messages').insert({
      lead_id: leadId,
      quo_message_id: messageId,
      direction: 'outbound',
      to_number: `+1${normalizedPhone}`,
      from_number: process.env.QUO_FROM_NUMBER ?? '',
      content: message,
      status: 'submitted',
      sent_at: sentAt,
    })

    const isLastStep = nextStep === 3
    const nextFollowUpAt = isLastStep
      ? null
      : addDays(new Date(sentAt), STEP_DELAY_DAYS[nextStep + 1] ?? 3).toISOString()

    // Update lead
    await db
      .from('leads')
      .update({
        followup_step: nextStep,
        last_followup_sent_at: sentAt,
        sms_status: 'submitted',
        sms_last_sent_at: sentAt,
        next_follow_up_at: nextFollowUpAt,
        ...(isLastStep ? { followup_completed_at: sentAt } : {}),
      })
      .eq('id', leadId)

    // If this was the first ever outreach, enroll in sequence
    if (!lead.followup_started_at) {
      await enrollLeadInSequence(db, leadId, sentAt)
    }

    return NextResponse.json({ ok: true, sent: true, message, step: nextStep })
  } catch (err) {
    console.error('[followups/send-now] sendSms failed:', err)
    return NextResponse.json(
      { ok: false, error: 'SMS sending failed — please try again' },
      { status: 502 },
    )
  }
}
