/**
 * POST /api/enrich/save-contact
 * Save a reviewed/confirmed Google Places candidate to a lead.
 * Body: { leadId, placeId, phone, internationalPhone, website, googleMapsUri, businessStatus, primaryType, confidence }
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
  overwritePhone: z.boolean().optional(),
  overwriteWebsite: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const d = parsed.data
  const db = createServiceClient()

  const { data: lead } = await db.from('leads').select('primary_phone,website').eq('id', d.leadId).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const updates: Record<string, unknown> = {
    google_place_id: d.placeId,
    contact_match_confidence: d.confidence,
    contact_source: 'google_places',
    contact_source_urls: [d.googleMapsUri].filter(Boolean),
    business_status: d.businessStatus ?? null,
    google_primary_type: d.primaryType ?? null,
    enrichment_status: 'completed',
    enriched_at: new Date().toISOString(),
    enrichment_error: null,
  }

  if ((!lead.primary_phone || d.overwritePhone) && d.phone) {
    updates.primary_phone = d.phone
    updates.international_phone = d.internationalPhone ?? null
  }
  if ((!lead.website || d.overwriteWebsite) && d.website) {
    updates.website = d.website
  }
  if (d.googleMapsUri) updates.google_maps_url = d.googleMapsUri

  const { data: updated, error } = await db
    .from('leads')
    .update(updates)
    .eq('id', d.leadId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: updated })
}
