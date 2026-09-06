import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Public endpoint — no auth required
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const db = createServiceClient()

  // Parse body (name, email, phone)
  let contactName = ''
  let contactEmail = ''
  let contactPhone = ''
  try {
    const body = await req.json()
    contactName  = (body.name  ?? '').toString().trim()
    contactEmail = (body.email ?? '').toString().trim()
    contactPhone = (body.phone ?? '').toString().trim()
  } catch {
    // body optional — tolerate missing JSON
  }

  // Find lead by slug
  const { data: lead } = await db
    .from('leads')
    .select('id, proposal_status')
    .eq('proposal_slug', slug)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Proposal not found' }, { status: 404 })
  }

  // Already accepted — idempotent
  if (lead.proposal_status === 'accepted') {
    return NextResponse.json({ ok: true, already_accepted: true })
  }

  const { error } = await db
    .from('leads')
    .update({
      proposal_status:       'accepted',
      proposal_accepted_at:  new Date().toISOString(),
      ...(contactName  ? { proposal_contact_name:  contactName  } : {}),
      ...(contactEmail ? { proposal_contact_email: contactEmail } : {}),
      ...(contactPhone ? { proposal_contact_phone: contactPhone } : {}),
    })
    .eq('id', lead.id)

  if (error) {
    console.error('[proposals/accept] DB error:', error)
    return NextResponse.json({ ok: false, error: 'Failed to accept proposal' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
