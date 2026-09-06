import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'

// Auth check using the same session cookie the app uses
async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  return !!cookieStore.get('mr_admin')?.value
}

// POST /api/proposals/[slug]/reset — reset proposal status to not_sent (auth required)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params
  const db = createServiceClient()

  // Find lead by slug
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
    .update({
      proposal_status: 'not_sent',
      proposal_sent_at: null,
      proposal_viewed_at: null,
      proposal_accepted_at: null,
    })
    .eq('id', lead.id)

  if (error) {
    console.error('[proposals/reset] DB error:', error)
    return NextResponse.json({ ok: false, error: 'Failed to reset proposal' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
