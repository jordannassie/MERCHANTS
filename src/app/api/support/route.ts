import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('support_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const schema = z.object({
  firstName: z.string().min(1),
  lastName:  z.string().min(1),
  phone:     z.string().optional().default(''),
  email:     z.string().email(),
  comments:  z.string().min(1),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { firstName, lastName, phone, email, comments } = parsed.data
  const db = createServiceClient()

  const { error } = await db.from('support_requests').insert({
    first_name: firstName,
    last_name:  lastName,
    phone,
    email,
    comments,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
