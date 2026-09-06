import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'

// Auth check using the same session cookie the app uses
async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  return !!cookieStore.get('mr_admin')?.value
}

// PATCH /api/proposals/[slug]/update — update proposal fields (auth required)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params
  const db = createServiceClient()

  let body: {
    savings_monthly?: number | null
    transaction_rate?: string | null
    equipment?: string | null
    contract?: string | null
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // Find lead by slug
  const { data: lead } = await db
    .from('leads')
    .select('id')
    .eq('proposal_slug', slug)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Proposal not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (body.savings_monthly !== undefined) updates.proposal_savings_monthly = body.savings_monthly
  if (body.transaction_rate !== undefined) updates.proposal_transaction_rate = body.transaction_rate
  if (body.equipment !== undefined) updates.proposal_equipment = body.equipment
  if (body.contract !== undefined) updates.proposal_contract = body.contract

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, message: 'Nothing to update' })
  }

  const { error } = await db.from('leads').update(updates).eq('id', lead.id)

  if (error) {
    console.error('[proposals/update] DB error:', error)
    return NextResponse.json({ ok: false, error: 'Failed to update proposal' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
