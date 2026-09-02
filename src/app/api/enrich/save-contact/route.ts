/**
 * POST /api/enrich/save-contact
 * Save a manually reviewed / confirmed Google Places candidate.
 * Gracefully falls back to 005 columns if 006 is not applied.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  placeId: z.string(),
  phone: z.string().nullable().optional(),
  internationalPhone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  googleMapsUri: z.string().nullable().optional(),
  businessStatus: z.string().nullable().optional(),
  primaryType: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100),
  displayName: z.string().optional(),
  formattedAddress: z.string().optional(),
  overwritePhone: z.boolean().optional(),
  overwriteWebsite: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })

  const d = parsed.data
  const db = createServiceClient()

  const { data: lead } = await db
    .from('leads')
    .select('primary_phone,website')
    .eq('id', d.leadId)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const now = new Date().toISOString()
  const baseUpdates: Record<string, unknown> = {
    enrichment_status: 'completed',
    enriched_at: now,
  }
  if ((!lead.primary_phone || d.overwritePhone) && d.phone) {
    baseUpdates.primary_phone = d.phone
  }
  if ((!lead.website || d.overwriteWebsite) && d.website) {
    baseUpdates.website = d.website
  }
  if (d.googleMapsUri) baseUpdates.google_maps_url = d.googleMapsUri

  const richUpdates = {
    ...baseUpdates,
    google_place_id: d.placeId,
    international_phone: d.internationalPhone ?? null,
    business_status: d.businessStatus ?? null,
    google_primary_type: d.primaryType ?? null,
    contact_match_confidence: d.confidence,
    contact_source: 'google_places',
    contact_source_urls: [d.googleMapsUri].filter(Boolean),
    enrichment_error: null,
  }

  const { error: richErr } = await db.from('leads').update(richUpdates).eq('id', d.leadId)
  if (richErr?.code === '42703') {
    await db.from('leads').update(baseUpdates).eq('id', d.leadId)
  }

  // Store full Place data in enrichment_jobs
  await db.from('enrichment_jobs').insert({
    lead_id: d.leadId,
    status: 'completed',
    raw_response: {
      source: 'google_places',
      google_place_id: d.placeId,
      confidence: d.confidence,
      displayName: d.displayName,
      formattedAddress: d.formattedAddress,
      nationalPhoneNumber: d.phone,
      websiteUri: d.website,
      googleMapsUri: d.googleMapsUri,
      businessStatus: d.businessStatus,
      primaryType: d.primaryType,
      manually_reviewed: true,
    },
    started_at: now,
    completed_at: now,
  })

  const { data: updated, error } = await db
    .from('leads')
    .select('id,display_name,outlet_name,primary_phone,website,google_maps_url,enrichment_status,enriched_at')
    .eq('id', d.leadId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: updated })
}
