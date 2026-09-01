import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({ territoryId: z.string().uuid() })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Verify territory ownership
  const { data: territory } = await supabase
    .from('territories')
    .select('*')
    .eq('id', parsed.data.territoryId)
    .eq('owner_id', user.id)
    .single()

  if (!territory) return NextResponse.json({ error: 'Territory not found' }, { status: 404 })

  // Get access token for the edge function call
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'No session' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })

  const edgeUrl = `${supabaseUrl}/functions/v1/import-texas-leads`

  const res = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ territoryId: territory.id }),
    signal: AbortSignal.timeout(120_000),
  })

  const json = await res.json()
  if (!res.ok) return NextResponse.json({ error: json.error ?? 'Import failed' }, { status: res.status })
  return NextResponse.json(json)
}
