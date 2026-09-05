import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendSms, syncContact } from '@/lib/quo'
import { isValidUSPhone, normalizeUSPhone } from '@/lib/source-utils'

const DAILY_LIMIT = 50

function todayMidnightUTC(): string {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString()
}

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

  // 6. Check daily limit
  const { count: sentToday } = await db
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .gte('sent_at', todayMidnightUTC())

  const dailyUsed = sentToday ?? 0
  if (dailyUsed >= DAILY_LIMIT) {
    return NextResponse.json(
      { ok: false, error: `Daily SMS limit of ${DAILY_LIMIT} reached. Try again tomorrow.` },
      { status: 429 }
    )
  }

  // 7. Check if SMS is paused via env var
  if (process.env.SMS_PAUSED === 'true') {
    return NextResponse.json({ ok: false, error: 'SMS sending is currently paused' }, { status: 503 })
  }

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

  await db.from('leads').update(statusUpdates).eq('id', leadId)

  // Fire-and-forget contact sync
  const businessName = lead.display_name || lead.outlet_name || 'Business'
  syncContact({ leadId, name: businessName, phone })
    .then(({ quoContactId }) =>
      db.from('leads').update({ quo_contact_id: quoContactId }).eq('id', leadId)
    )
    .catch(err => console.error('[sms/send] contact sync failed:', err))

  return NextResponse.json({ ok: true, messageId, sentAt })
}
