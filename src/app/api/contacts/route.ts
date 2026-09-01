import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  full_name: z.string().min(1),
  title: z.string().optional(),
  business_phone: z.string().optional(),
  mobile_phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  contact_type: z.enum(['owner', 'manager', 'decision_maker', 'other']).optional(),
  source_url: z.string().optional(),
  notes: z.string().optional(),
  is_primary: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const db = createServiceClient()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { leadId, ...rest } = parsed.data

  const { data: lead } = await db.from('leads').select('id').eq('id', leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (rest.is_primary) {
    await db.from('contacts').update({ is_primary: false }).eq('lead_id', leadId)
  }

  const { data: contact, error } = await db
    .from('contacts')
    .insert({ ...rest, lead_id: leadId, source_type: 'manual' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact })
}
