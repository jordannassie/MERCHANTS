import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  activityType: z.enum(['call', 'note', 'email', 'meeting', 'status_change']),
  contactId: z.string().uuid().nullable().optional(),
  callOutcome: z
    .enum(['no_answer', 'voicemail', 'connected', 'call_back', 'not_interested', 'appointment', 'won'])
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  occurredAt: z.string().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
  statusUpdate: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const db = createServiceClient()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const d = parsed.data

  const { data: lead } = await db
    .from('leads')
    .select('id,status')
    .eq('id', d.leadId)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const now = d.occurredAt ? new Date(d.occurredAt).toISOString() : new Date().toISOString()

  const { data: activity, error } = await db
    .from('activities')
    .insert({
      lead_id: d.leadId,
      contact_id: d.contactId ?? null,
      activity_type: d.activityType,
      call_outcome: d.callOutcome ?? null,
      notes: d.notes ?? null,
      duration_seconds: d.durationSeconds ?? null,
      occurred_at: now,
      next_follow_up_at: d.nextFollowUpAt ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const STATUS_ORDER = [
    'new', 'attempted', 'connected', 'follow_up',
    'appointment', 'won', 'lost', 'do_not_contact',
  ]
  const currentIdx = STATUS_ORDER.indexOf(lead.status)
  const leadUpdates: Record<string, unknown> = { last_contacted_at: now }

  if (d.statusUpdate && STATUS_ORDER.includes(d.statusUpdate)) {
    const newIdx = STATUS_ORDER.indexOf(d.statusUpdate)
    if (
      d.statusUpdate === 'do_not_contact' ||
      d.statusUpdate === 'lost' ||
      newIdx > currentIdx
    ) {
      leadUpdates.status = d.statusUpdate
    }
  }

  if (d.nextFollowUpAt) leadUpdates.next_follow_up_at = d.nextFollowUpAt

  const { data: updatedLead } = await db
    .from('leads')
    .update(leadUpdates)
    .eq('id', d.leadId)
    .select()
    .single()

  return NextResponse.json({ activity, updatedLead })
}
