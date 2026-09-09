import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendSms, isValidUSPhone } from '@/lib/quo'

// Public endpoint — no auth required (proposal acceptance is customer-facing)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const db = createServiceClient()

  // Parse body
  let contactName  = ''
  let contactEmail = ''
  let contactPhone = ''
  let selectedOption: string | null = null
  let calcSnapshot: Record<string, unknown> | null = null

  try {
    const body = await req.json()
    contactName   = (body.name  ?? '').toString().trim()
    contactEmail  = (body.email ?? '').toString().trim()
    contactPhone  = (body.phone ?? '').toString().trim()
    // New fields — optional for backward compat
    selectedOption =
      body.selectedOption === 'wholesale' || body.selectedOption === 'customer_pay'
        ? body.selectedOption
        : null
    calcSnapshot = body.calcSnapshot && typeof body.calcSnapshot === 'object'
      ? body.calcSnapshot as Record<string, unknown>
      : null
  } catch {
    // body optional — tolerate missing JSON
  }

  // Find lead by slug
  const { data: lead } = await db
    .from('leads')
    .select('id, proposal_status, display_name, outlet_name, permit_phone, primary_phone')
    .eq('proposal_slug', slug)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Proposal not found' }, { status: 404 })
  }

  // Already accepted or agreement_requested — idempotent
  if (
    lead.proposal_status === 'accepted' ||
    lead.proposal_status === 'agreement_requested'
  ) {
    return NextResponse.json({ ok: true, already_accepted: true })
  }

  const now = new Date().toISOString()

  const { error } = await db
    .from('leads')
    .update({
      proposal_status:        'agreement_requested',
      agreement_requested_at: now,
      proposal_accepted_at:   now,
      status:                 'agreement_requested',
      next_follow_up_at:      null,
      followup_completed_at:  now,
      ...(contactName  ? { proposal_contact_name:  contactName  } : {}),
      ...(contactEmail ? { proposal_contact_email: contactEmail } : {}),
      ...(contactPhone ? { proposal_contact_phone: contactPhone } : {}),
      ...(selectedOption ? { proposal_selected_option: selectedOption } : {}),
      ...(calcSnapshot  ? { proposal_calc_snapshot:   calcSnapshot  } : {}),
      ...(calcSnapshot?.monthly_sales != null
        ? { estimated_monthly_card_sales: Number(calcSnapshot.monthly_sales) }
        : {}),
    })
    .eq('id', lead.id)

  if (error) {
    console.error('[proposals/accept] DB error:', error)
    return NextResponse.json({ ok: false, error: 'Failed to accept proposal' }, { status: 500 })
  }

  // Send confirmation SMS if phone available and QUO configured
  if (process.env.QUO_API_KEY && contactPhone && isValidUSPhone(contactPhone)) {
    const businessName = lead.display_name || lead.outlet_name || 'there'
    const firstName    = contactName?.split(' ')[0] || businessName
    const confirmationMessage =
      `Thanks, ${firstName}. I received your request for the Service Agreement. I'll get everything prepared and reach out shortly to help get you set up.\n\nJordan\nProcess.Direct`

    sendSms(contactPhone, confirmationMessage).catch(err =>
      console.error('[proposals/accept] confirmation SMS failed:', err)
    )
  }

  return NextResponse.json({ ok: true })
}
