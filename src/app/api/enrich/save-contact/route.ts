/**
 * POST /api/enrich/save-contact
 * Save a manually reviewed / confirmed Google Places candidate.
 * Only updates columns that exist in migration 005 — no dependency on 006.
 * All rich metadata (placeId, confidence, etc.) goes into enrichment_jobs.
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
    .select('id,primary_phone,website')
    .eq('id', d.leadId)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const now = new Date().toISOString()

  // Only update columns that are safe without migration 006
  const updates: Record<string, unknown> = {
    enrichment_status: 'completed',
    enriched_at: now,
  }

  // Never overwrite manually entered phone unless explicitly requested
  if ((!lead.primary_phone || d.overwritePhone) && d.phone) {
    updates.primary_phone = d.phone
  }
  if ((!lead.website || d.overwriteWebsite) && d.website) {
    updates.website = d.website
  }
  if (d.googleMapsUri) {
    updates.google_maps_url = d.googleMapsUri
  }

  // Use .select() in the same chain so PostgREST returns the updated row atomically
  const { data: updated, error: updateErr } = await db
    .from('leads')
    .update(updates)
    .eq('id', d.leadId)
    .select('id,display_name,outlet_name,primary_phone,website,google_maps_url,enrichment_status,enriched_at')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Store full Place metadata in enrichment_jobs (independent of migration 006)
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
      internationalPhoneNumber: d.internationalPhone,
      websiteUri: d.website,
      googleMapsUri: d.googleMapsUri,
      businessStatus: d.businessStatus,
      primaryType: d.primaryType,
      manually_reviewed: true,
    },
    started_at: now,
    completed_at: now,
  })

  return NextResponse.json({ lead: updated })
}
