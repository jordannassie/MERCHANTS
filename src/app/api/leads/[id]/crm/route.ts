import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED = new Set([
  'display_name', 'primary_phone', 'primary_email', 'website',
  'owner_name', 'contact_title', 'category', 'est_monthly_processing',
  'google_maps_url',
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (ALLOWED.has(k)) safe[k] = v
  }

  const db = createServiceClient()
  const { data: lead, error } = await db
    .from('leads')
    .update(safe)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead })
}
