import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendSms, isValidUSPhone } from '@/lib/quo'
import { isPaymentAcceptance, type PaymentAcceptance } from '@/lib/proposals'

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
  let paymentAcceptance: PaymentAcceptance | null = null
  let calcSnapshot: Record<string, unknown> | null = null

  try {
    const body = await req.json()
    contactName   = (body.name  ?? '').toString().trim()
    contactEmail  = (body.email ?? '').toString().trim()
    contactPhone  = (body.phone ?? '').toString().trim()
    selectedOption =
      body.selectedOption === 'wholesale' || body.selectedOption === 'customer_pay'
        ? body.selectedOption
        : null
    paymentAcceptance = isPaymentAcceptance(body.paymentAcceptance)
      ? body.paymentAcceptance
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

  if (!paymentAcceptance) {
    return NextResponse.json(
      { ok: false, error: 'Please choose how you want to accept payments.' },
      { status: 422 },
    )
  }

  if (calcSnapshot) {
    calcSnapshot = { ...calcSnapshot, payment_acceptance: paymentAcceptance }
  } else {
    calcSnapshot = { payment_acceptance: paymentAcceptance }
  }

  const now = new Date().toISOString()

  const baseUpdate: Record<string, unknown> = {
    proposal_status:        'agreement_requested',
    agreement_requested_at: now,
    proposal_accepted_at:   now,
    status:                 'agreement_requested',
    next_follow_up_at:      null,
    followup_completed_at:  now,
    proposal_payment_acceptance: paymentAcceptance,
    ...(contactName  ? { proposal_contact_name:  contactName  } : {}),
    ...(contactEmail ? { proposal_contact_email: contactEmail } : {}),
    ...(contactPhone ? { proposal_contact_phone: contactPhone } : {}),
    ...(selectedOption ? { proposal_selected_option: selectedOption } : {}),
    ...(calcSnapshot  ? { proposal_calc_snapshot:   calcSnapshot  } : {}),
    ...(calcSnapshot?.monthly_sales != null
      ? { estimated_monthly_card_sales: Number(calcSnapshot.monthly_sales) }
      : {}),
  }

  let { error } = await db.from('leads').update(baseUpdate).eq('id', lead.id)

  // Column may not exist until migration 030 is applied — keep the request.
  if (error && /proposal_payment_acceptance/i.test(error.message ?? '')) {
    const { proposal_payment_acceptance: _drop, ...withoutCol } = baseUpdate
    void _drop
    ;({ error } = await db.from('leads').update(withoutCol).eq('id', lead.id))
  }

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
