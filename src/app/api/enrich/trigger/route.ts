import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({ leadIds: z.array(z.string().uuid()).min(1).max(25) })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'No session' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const res = await fetch(`${supabaseUrl}/functions/v1/enrich-leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ leadIds: parsed.data.leadIds }),
    signal: AbortSignal.timeout(120_000),
  })

  const json = await res.json()
  if (!res.ok) return NextResponse.json({ error: json.error ?? 'Failed' }, { status: res.status })
  return NextResponse.json(json)
}
