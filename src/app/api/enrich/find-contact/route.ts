/**
 * POST /api/enrich/find-contact
 * Google Places business match for a single lead.
 *
 * Works with migration 005 schema alone. All rich Place metadata is stored
 * in enrichment_jobs.raw_response. Only columns that exist in 005 are ever
 * updated on the leads row (primary_phone, website, google_maps_url,
 * enrichment_status, enriched_at).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { findPlacesContact, type LeadForSearch } from '@/lib/google-places'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
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

  // Rate limit: max 50 enrichment calls per 15 minutes (server-side, no login)
  const rl = await checkRateLimit(db, 'enrich')
  if (!rl.allowed) return rateLimitExceeded(rl) as unknown as ReturnType<typeof NextResponse.json>

  const { data: rawLead, error: leadErr } = await db
    .from('leads')
    .select(
      'id,display_name,outlet_name,taxpayer_name,outlet_address,outlet_city,' +
      'outlet_state,outlet_zip,primary_phone,website,enrichment_status'
    )
    .eq('id', leadId)
    .single()

  if (leadErr || !rawLead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }
  const lead = rawLead as unknown as LeadForSearch & { enrichment_status: string | null }

  // Check deduplication
  if (!forceRefresh && lead.enrichment_status === 'completed') {
    const { data: cachedJob } = await db
      .from('enrichment_jobs')
      .select('raw_response,proposed_data')
      .eq('lead_id', leadId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (cachedJob?.raw_response) {
      return NextResponse.json({
        status: 'already_enriched',
        cached: cachedJob.raw_response,
        lead: rawLead,
        candidates: [],
      })
    }
  }

  // Mark lead as searching
  await db.from('leads').update({ enrichment_status: 'running' }).eq('id', leadId)

  const result = await findPlacesContact(lead as LeadForSearch, apiKey)

  const searchQuery = encodeURIComponent(
    [lead.outlet_name ?? lead.display_name, lead.outlet_city, 'TX'].filter(Boolean).join(' ')
  )
  const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`

  if (result.status === 'error') {
    await db.from('leads').update({ enrichment_status: 'failed' }).eq('id', leadId)
    return NextResponse.json({ status: 'error', error: result.error, googleSearchUrl })
  }

  if (result.status === 'not_found') {
    await db.from('leads').update({ enrichment_status: 'failed' }).eq('id', leadId)
    await db.from('enrichment_jobs').insert({
      lead_id: leadId,
      status: 'failed',
      error_message: 'No matching place found on Google Places',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    return NextResponse.json({ status: 'not_found', candidates: [], googleSearchUrl })
  }

  if (result.status === 'review') {
    await db.from('leads').update({ enrichment_status: 'pending' }).eq('id', leadId)
    return NextResponse.json({
      status: 'review',
      candidates: result.candidates,
      googleSearchUrl,
    })
  }

  // Auto-save (confidence ≥ 85)
  if (result.status === 'found' && result.best) {
    const p = result.best
    const now = new Date().toISOString()

    const updates: Record<string, unknown> = {
      enrichment_status: 'completed',
      enriched_at: now,
    }
    if (!lead.primary_phone && p.nationalPhoneNumber) {
      updates.primary_phone = p.nationalPhoneNumber
    }
    if (!lead.website && p.websiteUri) {
      updates.website = p.websiteUri
    }
    if (p.googleMapsUri) {
      updates.google_maps_url = p.googleMapsUri
    }

    // Single atomic update + select — no separate re-fetch needed
    const { data: updatedLead, error: updateErr } = await db
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select('id,display_name,outlet_name,outlet_city,primary_phone,website,google_maps_url,enrichment_status,enriched_at')
      .single()

    if (updateErr) {
      console.error('[find-contact] lead update error:', updateErr)
    }

    // Store Place metadata in enrichment_jobs
    await db.from('enrichment_jobs').insert({
      lead_id: leadId,
      status: 'completed',
      raw_response: {
        source: 'google_places',
        google_place_id: p.id,
        confidence: p.confidence,
        displayName: p.displayName,
        formattedAddress: p.formattedAddress,
        nationalPhoneNumber: p.nationalPhoneNumber,
        internationalPhoneNumber: p.internationalPhoneNumber,
        websiteUri: p.websiteUri,
        googleMapsUri: p.googleMapsUri,
        businessStatus: p.businessStatus,
        primaryType: p.primaryType,
        types: p.types,
      },
      proposed_data: p,
      sources: p.googleMapsUri ? [{ url: p.googleMapsUri, title: `Google Maps: ${p.displayName}` }] : null,
      started_at: now,
      completed_at: now,
    })

    return NextResponse.json({
      status: 'found',
      confidence: p.confidence,
      lead: updatedLead ?? rawLead,
      place: p,
      candidates: result.candidates,
      googleSearchUrl,
    })
  }

  return NextResponse.json({ status: result.status, candidates: result.candidates, googleSearchUrl })
}
