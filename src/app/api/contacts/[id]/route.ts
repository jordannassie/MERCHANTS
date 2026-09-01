import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceOwnerId } from '@/lib/workspace'
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
  const db = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const { data: existing } = await db.from('contacts').select('lead_id').eq('id', id).eq('owner_id', ownerId).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (parsed.data.is_primary) {
    await db.from('contacts').update({ is_primary: false }).eq('lead_id', existing.lead_id).eq('owner_id', ownerId)
  }

  const { data: contact, error } = await db
    .from('contacts').update(parsed.data).eq('id', id).eq('owner_id', ownerId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()

  const { error } = await db.from('contacts').delete().eq('id', id).eq('owner_id', ownerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
