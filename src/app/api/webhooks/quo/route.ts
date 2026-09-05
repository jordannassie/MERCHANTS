import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyWebhookSignature } from '@/lib/quo'
import { normalizeUSPhone } from '@/lib/source-utils'

const STOP_KEYWORDS = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit',
])

function isStopMessage(text: string): boolean {
  return STOP_KEYWORDS.has(text.trim().toLowerCase())
}

export async function POST(req: NextRequest) {
  // 1. Read raw body as text (must happen before any other parsing)
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return NextResponse.json({ error: 'Cannot read body' }, { status: 400 })
  }

  // 2. Extract Standard-Webhooks headers
  const webhookId        = req.headers.get('webhook-id') ?? ''
  const webhookTimestamp = req.headers.get('webhook-timestamp') ?? ''
  const webhookSignature = req.headers.get('webhook-signature') ?? ''
  const secret           = process.env.QUO_WEBHOOK_SECRET ?? ''

  // 3. Verify signature — 401 immediately on failure
  const valid = verifyWebhookSignature(rawBody, {
    id:        webhookId,
    timestamp: webhookTimestamp,
    signature: webhookSignature,
    secret,
  })

  if (!valid) {
    console.warn('[webhook/quo] Invalid signature — rejecting request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 4. Parse JSON
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = payload.type as string | undefined
  const data      = payload.data as Record<string, unknown> | undefined

  const db = createServiceClient()

  // 5. Route by event type
  try {
    if (eventType === 'message.received') {
      await handleMessageReceived(db, data)
    } else if (eventType === 'message.delivered') {
      await handleMessageDelivered(db, data)
    } else if (eventType === 'message.failed') {
      await handleMessageFailed(db, data)
    } else if (eventType === 'contact.updated') {
      // No-op — just acknowledge
    } else {
      console.log(`[webhook/quo] Unhandled event type: ${eventType}`)
    }
  } catch (err) {
    // Log but still return 200 to prevent retries
    console.error(`[webhook/quo] Error handling ${eventType}:`, err)
  }

  return NextResponse.json({ ok: true })
}

// ── message.received ──────────────────────────────────────────────────────────

async function handleMessageReceived(
  db: ReturnType<typeof import('@/lib/supabase/service').createServiceClient>,
  data: Record<string, unknown> | undefined
) {
  const resource = data?.resource as Record<string, unknown> | undefined
  const context  = data?.context  as Record<string, unknown> | undefined

  const fromPhone = resource?.from as string | undefined
  const content   = resource?.body as string | undefined
  const quoMsgId  = resource?.id  as string | undefined

  if (!fromPhone) {
    console.warn('[webhook/quo] message.received: missing from phone')
    return
  }

  const normalizedPhone = normalizeUSPhone(fromPhone)
  const externalId      = (context?.contact as Record<string, unknown> | undefined)?.externalId as string | undefined

  // Find lead by externalId (leadId) or by normalized phone
  let leadId: string | null = null

  if (externalId) {
    const { data: lead } = await db
      .from('leads')
      .select('id')
      .eq('id', externalId)
      .maybeSingle()
    if (lead) leadId = lead.id
  }

  if (!leadId && normalizedPhone) {
    const { data: lead } = await db
      .from('leads')
      .select('id')
      .or(`permit_phone.eq.${normalizedPhone},primary_phone.eq.${normalizedPhone},permit_phone.eq.+1${normalizedPhone},primary_phone.eq.+1${normalizedPhone}`)
      .maybeSingle()
    if (lead) leadId = lead.id
  }

  const toNumber = (resource?.to as string[] | undefined)?.[0] ?? process.env.QUO_FROM_NUMBER ?? ''
  const now = new Date().toISOString()

  if (leadId) {
    // Insert inbound SMS record
    await db.from('sms_messages').insert({
      lead_id:       leadId,
      quo_message_id: quoMsgId ?? null,
      direction:     'inbound',
      to_number:     toNumber,
      from_number:   fromPhone,
      content:       content ?? '',
      status:        'received',
      sent_at:       now,
    })

    const stop = isStopMessage(content ?? '')

    if (stop) {
      // Add to suppression list
      await db.from('sms_suppression').upsert(
        {
          normalized_phone: normalizedPhone || fromPhone,
          lead_id:          leadId,
          opt_out_reason:   (content?.trim().toUpperCase()) ?? 'STOP',
          opted_out_at:     now,
        },
        { onConflict: 'normalized_phone' }
      )

      // Update lead
      await db.from('leads').update({
        status:          'do_not_contact',
        sms_status:      'opted_out',
        sms_needs_reply: false,
      }).eq('id', leadId)
    } else {
      // Non-STOP reply — needs reply
      await db.from('leads').update({
        sms_needs_reply: true,
        sms_status:      'needs_reply',
      }).eq('id', leadId)
    }
  } else {
    // Lead not found — still log inbound with best-effort info
    console.log(`[webhook/quo] message.received: lead not found for phone ${fromPhone}`)
  }
}

// ── message.delivered ─────────────────────────────────────────────────────────

async function handleMessageDelivered(
  db: ReturnType<typeof import('@/lib/supabase/service').createServiceClient>,
  data: Record<string, unknown> | undefined
) {
  const resource = data?.resource as Record<string, unknown> | undefined
  const quoMsgId = resource?.id as string | undefined

  if (!quoMsgId) return

  const now = new Date().toISOString()

  // Update sms_messages
  const { data: msgRow } = await db
    .from('sms_messages')
    .update({ status: 'delivered', delivered_at: now })
    .eq('quo_message_id', quoMsgId)
    .select('lead_id')
    .maybeSingle()

  // Update lead sms_status
  if (msgRow?.lead_id) {
    await db.from('leads').update({ sms_status: 'delivered' }).eq('id', msgRow.lead_id)
  }
}

// ── message.failed ────────────────────────────────────────────────────────────

async function handleMessageFailed(
  db: ReturnType<typeof import('@/lib/supabase/service').createServiceClient>,
  data: Record<string, unknown> | undefined
) {
  const resource     = data?.resource as Record<string, unknown> | undefined
  const quoMsgId     = resource?.id as string | undefined
  const errorMessage = (resource?.errorMessage ?? resource?.error_message ?? 'Delivery failed') as string

  if (!quoMsgId) return

  // Update sms_messages
  const { data: msgRow } = await db
    .from('sms_messages')
    .update({ status: 'failed', error_message: errorMessage })
    .eq('quo_message_id', quoMsgId)
    .select('lead_id')
    .maybeSingle()

  // Update lead sms_status
  if (msgRow?.lead_id) {
    await db.from('leads').update({ sms_status: 'failed' }).eq('id', msgRow.lead_id)
  }
}
