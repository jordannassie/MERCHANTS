import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ensureProposalSlug, getProposalUrl } from '@/lib/proposals'

// POST /api/proposals/ensure-slug
// Body: { leadId: string }
// Returns: { slug: string, url: string }
export async function POST(req: NextRequest) {
  let body: { leadId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { leadId } = body
  if (!leadId) {
    return NextResponse.json({ ok: false, error: 'leadId is required' }, { status: 400 })
  }

  const db = createServiceClient()

  const { data: lead } = await db
    .from('leads')
    .select('id, display_name, outlet_name, taxpayer_name, proposal_slug')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })
  }

  const name = lead.display_name || lead.outlet_name || lead.taxpayer_name || null
  const slug = await ensureProposalSlug(db, leadId, name)

  return NextResponse.json({ ok: true, slug, url: getProposalUrl(slug) })
}
