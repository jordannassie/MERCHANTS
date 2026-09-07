import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendSms, syncContact } from '@/lib/quo'
import { isValidUSPhone, normalizeUSPhone } from '@/lib/source-utils'
import { enrollLeadInSequence } from '@/lib/followup-engine'

export async function POST(req: NextRequest) {
  // 1. QUO_API_KEY must be set
  if (!process.env.QUO_API_KEY) {
    return NextResponse.json({ ok: false, error: 'SMS is not configured' }, { status: 503 })
  }

  let body: { leadId?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  // 2. leadId required
  const { leadId, content } = body
  if (!leadId) {
    return NextResponse.json({ ok: false, error: 'leadId is required' }, { status: 400 })
  }
  if (!content?.trim()) {
    return NextResponse.json({ ok: false, error: 'content is required' }, { status: 400 })
  }

  const db = createServiceClient()

  // 3. Fetch lead — must exist and have a valid phone
  const { data: lead, error: leadError } = await db
    .from('leads')
    .select('id, status, display_name, outlet_name, permit_phone, primary_phone, sms_status')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const phone = lead.permit_phone ?? lead.primary_phone
  if (!phone || !isValidUSPhone(phone)) {
    return NextResponse.json({ ok: false, error: 'Lead has no valid phone number' }, { status: 422 })
  }

  // 4. Lead must not be do_not_contact
  if (lead.status === 'do_not_contact') {
    return NextResponse.json({ ok: false, error: 'Lead is marked Do Not Contact' }, { status: 422 })
  }

  const normalizedPhone = normalizeUSPhone(phone)

  // 5. Check suppression list
  const { data: suppressed } = await db
    .from('sms_suppression')
    .select('id')
    .eq('normalized_phone', normalizedPhone)
    .maybeSingle()

  if (suppressed) {
    return NextResponse.json({ ok: false, error: 'This number has opted out of SMS messages' }, { status: 422 })
  }

  // (SMS_PAUSED env var removed — manual sends are never artificially blocked)

  // ── Send ──────────────────────────────────────────────────────────────────
  let messageId: string
  const sentAt = new Date().toISOString()

  try {
    const result = await sendSms(phone, content.trim())
    messageId = result.messageId
  } catch (err) {
    const safeError = 'SMS sending failed — please try again'
    console.error('[sms/send] sendSms failed:', err)

    // Insert failed record
    await db.from('sms_messages').insert({
      lead_id: leadId,
      direction: 'outbound',
      to_number: `+1${normalizedPhone}`,
      from_number: process.env.QUO_FROM_NUMBER ?? '',
      content: content.trim(),
      status: 'failed',
      error_message: safeError,
      sent_at: sentAt,
    })

    return NextResponse.json({ ok: false, error: safeError }, { status: 502 })
  }

  // Insert sms_messages record
  await db.from('sms_messages').insert({
    lead_id: leadId,
    quo_message_id: messageId,
    direction: 'outbound',
    to_number: `+1${normalizedPhone}`,
    from_number: process.env.QUO_FROM_NUMBER ?? '',
    content: content.trim(),
    status: 'submitted',
    sent_at: sentAt,
  })

  // Update lead status: new → attempted (only)
  const statusUpdates: Record<string, unknown> = {
    sms_status: 'submitted',
    sms_last_sent_at: sentAt,
  }
  if (lead.status === 'new') {
    statusUpdates.status = 'attempted'
  }

  // If this message contains a proposal link, mark proposal as sent (only if not already viewed/accepted)
  if (content.includes('/p/')) {
    const { data: proposalLead } = await db
      .from('leads')
      .select('proposal_status')
      .eq('id', leadId)
      .maybeSingle()
    if (proposalLead?.proposal_status === 'not_sent' || proposalLead?.proposal_status == null) {
      statusUpdates.proposal_status = 'sent'
      statusUpdates.proposal_sent_at = sentAt
    }
  }

  await db.from('leads').update(statusUpdates).eq('id', leadId)

  // Enroll in follow-up sequence after first manual SMS (status was 'new')
  if (lead.status === 'new') {
    enrollLeadInSequence(db, leadId, sentAt).catch(err =>
      console.error('[sms/send] enrollLeadInSequence failed:', err)
    )
  }

  // Fire-and-forget contact sync
  const businessName = lead.display_name || lead.outlet_name || 'Business'
  syncContact({ leadId, name: businessName, phone })
    .then(({ quoContactId }) =>
      db.from('leads').update({ quo_contact_id: quoContactId }).eq('id', leadId)
    )
    .catch(err => console.error('[sms/send] contact sync failed:', err))

  return NextResponse.json({ ok: true, messageId, sentAt })
}
