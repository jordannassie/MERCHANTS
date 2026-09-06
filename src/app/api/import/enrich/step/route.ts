/**
 * POST /api/import/enrich/step
 *
 * Enriches ONE State lead by searching Google Places for its specific business.
 * Uses the existing findPlacesContact() confidence-scoring function.
 *
 * Body: { leadId: string }
 *
 * Returns:
 * {
 *   result: 'found' | 'not_found' | 'no_phone' | 'quota_exceeded' | 'error' | 'skipped',
 *   phone?: string,              // only when result = 'found'
 *   confidence?: number,
 *   place_id?: string,
 *   google_maps_url?: string,
 *   searches_used_today: number,
 *   searches_remaining: number,
 *   error?: string               // safe message (no API details)
 * }
 *
 * Quota gate:
 *   - Checks today's google_search_runs count BEFORE calling the API
 *   - Returns result='quota_exceeded' immediately if limit reached
 *   - Inserts a search run AFTER the API call so the count is accurate
 *   - Never advances the lead's attempt date on quota_exceeded
 *
 * On success (found + phone):
 *   - Sets primary_phone (if empty) OR permit_phone
 *   - Sets google_place_id, google_maps_url
 *   - Sets lead_source_label = 'both'
 *   - Sets google_enrichment_result = 'found', google_enrichment_attempted_at = now()
 *   - Upserts lead_sources row
 *   - NEVER touches: status, starred, notes, next_follow_up_at, permit_phone if non-empty
 *
 * On no match or no phone:
 *   - Sets google_enrichment_result = 'not_found' | 'no_phone'
 *   - Sets google_enrichment_attempted_at = now()
 *   - Does NOT create a new lead or add any phone
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { findPlacesContact } from '@/lib/google-places'
import { isValidUSPhone } from '@/lib/source-utils'

export const maxDuration = 30

const DAILY_LIMIT = Number(process.env.ENRICH_DAILY_LIMIT ?? 100)

export async function POST(req: NextRequest) {
  const db = createServiceClient()

  // ── Parse body ─────────────────────────────────────────────────────────────
  const { leadId } = await req.json() as { leadId?: string }
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ result: 'error', error: 'GOOGLE_MAPS_API_KEY not configured', searches_used_today: 0, searches_remaining: 0 })

  // ── Check daily quota BEFORE calling the API ───────────────────────────────
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const { count: usedToday } = await db
    .from('google_search_runs')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', todayStart.toISOString())

  const used      = usedToday ?? 0
  const remaining = Math.max(0, DAILY_LIMIT - used)

  if (remaining <= 0) {
    return NextResponse.json({
      result:               'quota_exceeded',
      searches_used_today:  used,
      searches_remaining:   0,
      error:                'Daily Google Places search quota reached. Resume tomorrow.',
    })
  }

  // ── Fetch the lead ─────────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .select('id, outlet_name, display_name, taxpayer_name, outlet_city, outlet_state, outlet_zip, outlet_address, primary_phone, permit_phone')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ result: 'error', error: 'Lead not found', searches_used_today: used, searches_remaining: remaining })
  }

  // Skip if already has a phone (shouldn't happen but be safe)
  const alreadyCallable = isValidUSPhone(lead.primary_phone) || isValidUSPhone(lead.permit_phone)
  if (alreadyCallable) {
    return NextResponse.json({ result: 'skipped', error: 'Lead already has phone', searches_used_today: used, searches_remaining: remaining })
  }

  const businessName = lead.outlet_name ?? lead.display_name ?? lead.taxpayer_name ?? ''
  if (!businessName) {
    return NextResponse.json({ result: 'skipped', error: 'No business name', searches_used_today: used, searches_remaining: remaining })
  }

  // ── Call Google Places ─────────────────────────────────────────────────────
  const searchQuery = [businessName, lead.outlet_city, lead.outlet_state ?? 'TX'].filter(Boolean).join(', ')
  let matchResult: Awaited<ReturnType<typeof findPlacesContact>>

  try {
    matchResult = await findPlacesContact({
      id:            lead.id,
      display_name:  lead.display_name,
      outlet_name:   lead.outlet_name,
      taxpayer_name: lead.taxpayer_name,
      outlet_address: lead.outlet_address,
      outlet_city:   lead.outlet_city,
      outlet_state:  lead.outlet_state,
      outlet_zip:    lead.outlet_zip,
      primary_phone: lead.primary_phone,
      website:       null,
    }, apiKey)
  } catch (err) {
    const errMsg = String(err)
    const isQuota = errMsg.toLowerCase().includes('quota') || errMsg.includes('429')

    // Record the attempt (unless quota)
    if (!isQuota) {
      await db.from('leads').update({
        google_enrichment_attempted_at: new Date().toISOString(),
        google_enrichment_result:       'error',
      }).eq('id', leadId)
    }

    return NextResponse.json({
      result:               isQuota ? 'quota_exceeded' : 'error',
      error:                isQuota ? 'Daily Google Places quota exceeded. Resume tomorrow.' : 'Google Places search failed',
      searches_used_today:  used,
      searches_remaining:   isQuota ? 0 : remaining - 1,
    })
  }

  // ── Record that we used one quota unit ────────────────────────────────────
  await db.from('google_search_runs').insert({
    state:          lead.outlet_state ?? 'TX',
    location:       lead.outlet_city,
    query:          searchQuery,
    results_found:  matchResult.candidates.length,
    new_leads:      0,
    enriched_leads: 0,
  })

  const newRemaining = Math.max(0, remaining - 1)

  // ── No match ───────────────────────────────────────────────────────────────
  if (matchResult.status === 'not_found' || !matchResult.best) {
    await db.from('leads').update({
      google_enrichment_attempted_at: new Date().toISOString(),
      google_enrichment_result:       'not_found',
    }).eq('id', leadId)

    return NextResponse.json({
      result:               'not_found',
      confidence:           0,
      searches_used_today:  used + 1,
      searches_remaining:   newRemaining,
    })
  }

  const best = matchResult.best

  // ── Match found but no valid phone ────────────────────────────────────────
  const phone = best.nationalPhoneNumber ?? best.internationalPhoneNumber ?? null
  if (!isValidUSPhone(phone)) {
    await db.from('leads').update({
      google_enrichment_attempted_at: new Date().toISOString(),
      google_enrichment_result:       'no_phone',
      // Still store Place ID so we can find this business later
      ...(best.id           ? { google_place_id:  `places/${best.id}` }  : {}),
      ...(best.googleMapsUri ? { google_maps_url: best.googleMapsUri }   : {}),
    }).eq('id', leadId)

    return NextResponse.json({
      result:               'no_phone',
      confidence:           best.confidence,
      place_id:             best.id ?? null,
      searches_used_today:  used + 1,
      searches_remaining:   newRemaining,
    })
  }

  // ── Confident match + valid phone → enrich the State lead ─────────────────
  const placeId     = `places/${best.id}`
  const mapsUrl     = best.googleMapsUri ?? `https://maps.google.com/maps/place/?q=place_id:${best.id}`
  const now         = new Date().toISOString()

  // Enrich lead — never overwrite permit_phone if already set, never touch pipeline fields
  const updatePayload: Record<string, unknown> = {
    google_place_id:                placeId,
    google_maps_url:                mapsUrl,
    lead_source_label:              'both',
    google_enrichment_attempted_at: now,
    google_enrichment_result:       'found',
    last_seen_at:                   now,
  }

  // Add phone: prefer permit_phone slot; fall back to primary_phone
  if (!isValidUSPhone(lead.permit_phone)) {
    updatePayload.permit_phone = phone
  } else if (!isValidUSPhone(lead.primary_phone)) {
    updatePayload.primary_phone = phone
  }

  // Optionally store website if we have it and lead doesn't
  if (best.websiteUri) updatePayload.website = best.websiteUri

  await db.from('leads').update(updatePayload).eq('id', leadId)

  // Upsert lead_sources row
  await db.from('lead_sources').upsert(
    {
      lead_id:     leadId,
      source_type: 'google_places',
      external_id: placeId,
      source_url:  mapsUrl,
      last_seen_at: now,
      metadata:    { name: best.displayName, address: best.formattedAddress, confidence: best.confidence },
    },
    { onConflict: 'lead_id,source_type' }
  )

  // Update the search run with enriched count
  await db.from('google_search_runs')
    .update({ enriched_leads: 1 })
    .eq('location', lead.outlet_city ?? '')
    .eq('query', searchQuery)
    .gte('started_at', todayStart.toISOString())
    .order('started_at', { ascending: false })
    .limit(1)

  return NextResponse.json({
    result:               'found',
    phone,
    confidence:           best.confidence,
    place_id:             placeId,
    google_maps_url:      mapsUrl,
    searches_used_today:  used + 1,
    searches_remaining:   newRemaining,
  })
}
