import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const db = createServiceClient()
  const { data, error } = await db
    .from('contacts')
    .select('id, full_name, business_phone, mobile_phone, email, notes, inquiry_type, industry, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}


