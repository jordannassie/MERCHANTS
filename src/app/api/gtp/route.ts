import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const schema = z.object({
  full_name: z.string().min(1),
  business_name: z.string().min(1),
  phone: z.string().min(10),
  city: z.string().min(1),
  industry: z.string().optional().default(''),
  payment_need: z.string().min(1),
  opening_timeline: z.string().min(1),
  sms_consent: z.boolean(),
  utm_source: z.string().optional().default(''),
  utm_medium: z.string().optional().default(''),
  utm_campaign: z.string().optional().default(''),
  utm_content: z.string().optional().default(''),
  utm_term: z.string().optional().default(''),
  honeypot: z.string().optional().default(''),
})

function normalizePhone(raw: string) {
  const digits = raw.replace(/\\D/g, '')
  if (digits.length < 10) return null
  return digits
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  const data = parsed.data

  // honeypot
  if (data.honeypot && data.honeypot.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const phone = normalizePhone(data.phone)
  if (!phone) return NextResponse.json({ error: 'Invalid phone' }, { status: 400 })

  const db = createServiceClient()

  // prevent rapid duplicates (last 5 minutes)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: existing } = await db.from('leads').select('id').eq('primary_phone', phone).gte('created_at', fiveMinAgo).limit(1)
  if (existing && existing.length > 0) return NextResponse.json({ error: 'Duplicate' }, { status: 429 })

  const insertObj: any = {
    display_name: data.full_name,
    outlet_name: data.business_name,
    primary_phone: phone,
    primary_email: '', // not collected here
    outlet_city: data.city,
    category: data.industry,
    payment_need: data.payment_need,
    opening_timeline: data.opening_timeline,
    sms_consent: data.sms_consent,
    sms_consent_timestamp: data.sms_consent ? new Date().toISOString() : null,
    sms_consent_text_version: 'gtp-v1',
    source: 'chatgpt_ads',
    status: 'new',
    page_path: '/gtp',
    utm_source: data.utm_source,
    utm_medium: data.utm_medium,
    utm_campaign: data.utm_campaign,
    utm_content: data.utm_content,
    utm_term: data.utm_term,
  }

  const { data: created, error } = await db.from('leads').insert(insertObj).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // fire placeholder conversion event (to be wired)
  // TODO: trigger pixel or tracking helper here

  return NextResponse.json({ ok: true, lead: created })
}

