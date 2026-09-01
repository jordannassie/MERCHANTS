import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  activityType: z.enum(['call','note','email','meeting','status_change']),
  contactId: z.string().uuid().nullable().optional(),
  callOutcome: z.enum(['no_answer','voicemail','connected','call_back','not_interested','appointment','won']).nullable().optional(),
  notes: z.string().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  occurredAt: z.string().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
  statusUpdate: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const d = parsed.data

  // Verify lead ownership
  const { data: lead } = await supabase.from('leads').select('id,status').eq('id', d.leadId).eq('owner_id', user.id).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const now = d.occurredAt ? new Date(d.occurredAt).toISOString() : new Date().toISOString()

  // Insert activity
  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      lead_id: d.leadId,
      owner_id: user.id,
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

  // Status update logic — only advance if not already at a further stage
  const STATUS_ORDER = ['new','attempted','connected','follow_up','appointment','won','lost','do_not_contact']
  const currentIdx = STATUS_ORDER.indexOf(lead.status)
  const newStatus = d.statusUpdate

  const leadUpdates: Record<string, unknown> = { last_contacted_at: now }

  if (newStatus && STATUS_ORDER.includes(newStatus)) {
    const newIdx = STATUS_ORDER.indexOf(newStatus)
    // Allow explicit do_not_contact regardless of order
    if (newStatus === 'do_not_contact' || newStatus === 'lost' || newIdx > currentIdx) {
      leadUpdates.status = newStatus
    }
  }

  if (d.nextFollowUpAt) leadUpdates.next_follow_up_at = d.nextFollowUpAt

  const { data: updatedLead } = await supabase
    .from('leads').update(leadUpdates).eq('id', d.leadId).eq('owner_id', user.id).select().single()

  return NextResponse.json({ activity, updatedLead })
}
