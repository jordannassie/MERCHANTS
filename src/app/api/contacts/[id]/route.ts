import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const patchSchema = z.object({
  full_name: z.string().min(1).optional(),
  title: z.string().optional(),
  business_phone: z.string().optional(),
  mobile_phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  contact_type: z.enum(['owner','manager','decision_maker','other']).optional(),
  source_url: z.string().optional(),
  notes: z.string().optional(),
  is_primary: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  // Get contact to find lead_id for primary clearing
  const { data: existing } = await supabase.from('contacts').select('lead_id').eq('id', id).eq('owner_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (parsed.data.is_primary) {
    await supabase.from('contacts').update({ is_primary: false }).eq('lead_id', existing.lead_id).eq('owner_id', user.id)
  }

  const { data: contact, error } = await supabase
    .from('contacts').update(parsed.data).eq('id', id).eq('owner_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('contacts').delete().eq('id', id).eq('owner_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
