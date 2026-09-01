import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const schema = z.object({ leadIds: z.array(z.string().uuid()).min(1).max(25) })

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  // Verify leads exist
  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .in('id', parsed.data.leadIds)

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: 'No valid leads found' }, { status: 404 })
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/enrich-leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ leadIds: parsed.data.leadIds }),
    signal: AbortSignal.timeout(120_000),
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? 'Enrichment failed' }, { status: res.status })
  }
  return NextResponse.json(data)
}
