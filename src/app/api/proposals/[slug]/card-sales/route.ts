import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Public endpoint — merchant updates their own estimated volume
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const db = createServiceClient()

  let amount: number | null = null
  try {
    const body = await req.json()
    const parsed = Number(body.amount)
    if (!isNaN(parsed) && parsed >= 0) amount = parsed
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
  }

  const { data: lead } = await db
    .from('leads')
    .select('id')
    .eq('proposal_slug', slug)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Proposal not found' }, { status: 404 })
  }

  const { error } = await db
    .from('leads')
    .update({ estimated_monthly_card_sales: amount })
    .eq('id', lead.id)

  if (error) {
    console.error('[proposals/card-sales] DB error:', error)
    return NextResponse.json({ ok: false, error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
