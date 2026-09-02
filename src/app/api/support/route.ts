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
  comments:  z.string().optional().default(''),
  subject:   z.string().optional().default(''),
  inquiry_type: z.string().optional().default(''),
  industry:  z.string().optional().default(''),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { firstName, lastName, phone, email, comments, subject, inquiry_type, industry } = parsed.data
  const db = createServiceClient()

  const fullComments = subject ? `[${subject}]\n\n${comments}` : comments

  // Primary: attempt to insert into public.contacts (map fields)
  let contactError = null
  try {
    const full_name = `${firstName} ${lastName}`.trim()
    const { error: cErr } = await db
      .from('contacts')
      .insert({
        full_name,
        business_phone: phone,
        email,
        notes: fullComments,
        inquiry_type,
        industry,
      })
    contactError = cErr
  } catch (e) {
    contactError = e
  }

  // Also keep a backup in support_requests for the support admin view
  const { error } = await db.from('support_requests').insert({
    first_name: firstName,
    last_name: lastName,
    phone,
    email,
    comments: fullComments,
    inquiry_type,
    industry,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
