/**
 * POST /api/enrich/find-contact
 * Find a phone/website for a single lead via Google Places API (New).
 * Body: { leadId: string, forceRefresh?: boolean }
 * Returns: { status, lead, candidates, googleSearchUrl }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { findPlacesContact, type LeadForSearch } from '@/lib/google-places'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  forceRefresh: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_MAPS_API_KEY is not configured on this server.' },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { leadId, forceRefresh } = parsed.data
  const db = createServiceClient()

  const { data: rawLead, error: leadErr } = await db
    .from('leads')
    .select(
      'id,display_name,outlet_name,taxpayer_name,outlet_address,outlet_city,' +
      'outlet_state,outlet_zip,primary_phone,website,google_place_id,enrichment_status'
    )
    .eq('id', leadId)
    .single()

  if (leadErr || !rawLead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const lead = rawLead as unknown as LeadForSearch & { google_place_id: string | null; enrichment_status: string | null }

  // Skip if already enriched and not forcing refresh
  if (!forceRefresh && lead.google_place_id && lead.enrichment_status === 'completed') {
    return NextResponse.json({
      status: 'already_enriched',
      lead,
      candidates: [],
    })
  }

  // Mark as running
  await db
    .from('leads')
    .update({ enrichment_status: 'running', enrichment_error: null })
    .eq('id', leadId)

  const result = await findPlacesContact(lead as LeadForSearch, apiKey)

  // Build Google search fallback URL
  const searchQuery = encodeURIComponent(
    [lead.outlet_name ?? lead.display_name, lead.outlet_city, 'TX'].filter(Boolean).join(' ')
  )
  const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`

  if (result.status === 'error') {
    await db
      .from('leads')
      .update({ enrichment_status: 'failed', enrichment_error: result.error ?? null })
      .eq('id', leadId)
    return NextResponse.json({
      status: 'error',
      error: result.error,
      googleSearchUrl,
    }, { status: 200 })
  }

  if (result.status === 'not_found') {
    await db
      .from('leads')
      .update({ enrichment_status: 'failed', enrichment_error: 'No matching place found' })
      .eq('id', leadId)
    return NextResponse.json({
      status: 'not_found',
      candidates: [],
      googleSearchUrl,
    })
  }

  // For review status, return candidates without saving
  if (result.status === 'review') {
    await db
      .from('leads')
      .update({ enrichment_status: 'pending' })
      .eq('id', leadId)
    return NextResponse.json({
      status: 'review',
      candidates: result.candidates,
      googleSearchUrl,
    })
  }

  // Auto-save for confidence ≥ 85
  if (result.status === 'found' && result.best) {
    const p = result.best
    const updates: Record<string, unknown> = {
      enrichment_status: 'completed',
      enriched_at: new Date().toISOString(),
      enrichment_error: null,
      google_place_id: p.id,
      contact_match_confidence: p.confidence,
      contact_source: 'google_places',
      contact_source_urls: [p.googleMapsUri].filter(Boolean),
      business_status: p.businessStatus,
      google_primary_type: p.primaryType,
    }

    // Only set phone/website if not already manually entered
    if (!(lead as LeadForSearch).primary_phone && p.nationalPhoneNumber) {
      updates.primary_phone = p.nationalPhoneNumber
      updates.international_phone = p.internationalPhoneNumber
    }
    if (!(lead as LeadForSearch).website && p.websiteUri) {
      updates.website = p.websiteUri
    }
    if (p.googleMapsUri) {
      updates.google_maps_url = p.googleMapsUri
    }

    await db.from('leads').update(updates).eq('id', leadId)

    const { data: updatedLead } = await db.from('leads').select('*').eq('id', leadId).single()
    return NextResponse.json({
      status: 'found',
      lead: updatedLead,
      candidates: result.candidates,
      googleSearchUrl,
    })
  }

  return NextResponse.json({ status: result.status, candidates: result.candidates, googleSearchUrl })
}
