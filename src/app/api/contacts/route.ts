import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  full_name: z.string().min(1),
  title: z.string().optional(),
  business_phone: z.string().optional(),
  mobile_phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  contact_type: z.enum(['owner','manager','decision_maker','other']).optional(),
  source_url: z.string().optional(),
  notes: z.string().optional(),
  is_primary: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const { leadId, ...rest } = parsed.data

  // Verify lead ownership
  const { data: lead } = await supabase.from('leads').select('id').eq('id', leadId).eq('owner_id', user.id).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // If setting primary, clear others
  if (rest.is_primary) {
    await supabase.from('contacts').update({ is_primary: false }).eq('lead_id', leadId).eq('owner_id', user.id)
  }

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({ ...rest, lead_id: leadId, owner_id: user.id, source_type: 'manual' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact })
}
