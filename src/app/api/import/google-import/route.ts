/**
 * POST /api/import/google-import
 *
 * Phone-first: a Google result is only added to leads when it has
 * a valid US phone number. Phone-less results are counted and reported
 * but never inserted into the leads table or callable queue.
 *
 * Dedup order: Place ID > normalized phone > name + address
 *
 * Enrichment rules for matched State leads:
 *   - Add google_place_id, google_maps_url, lead_source_label = 'both'
 *   - Add primary_phone only when primary_phone is NULL and match was NOT by phone
 *   - Never touch: status, starred, notes, permit_phone, next_follow_up_at
 *
 * Body: { results: GooglePlacePreview[], state, location, query }
 * Returns: { run_id, new_leads, enriched_leads, skipped_dup, no_phone, error? }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { googlePlaceToTaxpayerNumber, computeSourceLabel, isValidUSPhone } from '@/lib/source-utils'
import type { GooglePlacePreview } from '@/lib/types'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const db = createServiceClient()

  try {
    const body = await req.json() as {
      results: GooglePlacePreview[]
      state?: string
      location?: string
      query?: string
    }

    const { results = [] } = body
    const state    = (body.state    || 'TX').trim().toUpperCase()
    const location = (body.location || '').trim()
    const query    = (body.query    || '').trim()

    if (results.length === 0) {
      return NextResponse.json({ error: 'No results to import' }, { status: 400 })
    }

    // ── Create a search run log entry ──────────────────────────────────────
    const { data: runRow, error: runErr } = await db
      .from('google_search_runs')
      .insert({ state, location: location || null, query, results_found: results.length })
      .select('id')
      .single()

    if (runErr || !runRow) {
      console.error('[google-import] run insert error', runErr)
      return NextResponse.json({ error: 'Failed to create search run log' }, { status: 500 })
    }
    const runId = runRow.id as string

    let newLeads      = 0
    let enrichedLeads = 0
    let skippedDup    = 0
    let noPhone       = 0

    for (const place of results) {
      // ── Phone gate: skip anything without a valid US phone ──────────────
      if (!isValidUSPhone(place.phone)) {
        noPhone++
        continue
      }
      // ── Name gate: skip nameless results ──────────────────────────────
      if (!place.name?.trim()) { skippedDup++; continue }

      try {
        if (place.matched_lead_id) {
          // ── Enrich existing lead ─────────────────────────────────────────
          const { data: existing } = await db
            .from('leads')
            .select('lead_source_label, primary_phone, google_place_id')
            .eq('id', place.matched_lead_id)
            .single()

          // If this exact place_id is already stored on this lead → just update last_seen
          const alreadyHasThisPlace = existing?.google_place_id === place.place_id

          const newLabel = computeSourceLabel(existing?.lead_source_label ?? null, true)

          const enrichPayload: Record<string, unknown> = {
            google_place_id:   place.place_id,
            google_maps_url:   place.google_maps_url,
            lead_source_label: newLabel,
            last_seen_at:      new Date().toISOString(),
          }

          // Add Google phone as primary_phone only when:
          // 1. Lead has no primary_phone yet
          // 2. The match was NOT by phone (to avoid pointless overwrites)
          if (!existing?.primary_phone && place.match_type !== 'phone' && place.phone) {
            enrichPayload.primary_phone = place.phone
          }

          // Add website if lead doesn't have one
          if (place.website) enrichPayload.website = place.website

          const { error: upErr } = await db
            .from('leads')
            .update(enrichPayload)
            .eq('id', place.matched_lead_id)

          if (upErr) {
            console.error('[google-import] enrich error', upErr)
            continue
          }

          // Upsert lead_sources row
          await db.from('lead_sources').upsert(
            {
              lead_id:       place.matched_lead_id,
              source_type:   'google_places',
              external_id:   place.place_id,
              source_url:    place.google_maps_url,
              last_seen_at:  new Date().toISOString(),
              search_run_id: runId,
              metadata:      { name: place.name, address: place.formatted_address, types: place.types },
            },
            { onConflict: 'lead_id,source_type' }
          )

          if (alreadyHasThisPlace && existing?.lead_source_label === 'google') {
            // Pure Google lead we've seen before → dup
            skippedDup++
          } else {
            // State lead enriched with Google OR first time enriching
            enrichedLeads++
          }

        } else {
          // ── Create new Google-only lead ──────────────────────────────────
          const taxpayerNumber = googlePlaceToTaxpayerNumber(place.place_id)

          const { data: inserted, error: insErr } = await db
            .from('leads')
            .upsert(
              {
                source:             'google_places',
                taxpayer_number:    taxpayerNumber,
                outlet_number:      '0',
                display_name:       place.name,
                outlet_name:        place.name,
                outlet_address:     place.street_address,
                outlet_city:        place.city,
                outlet_state:       place.state ?? state,
                outlet_zip:         place.zip,
                outlet_county_code: null,
                taxpayer_city:      place.city,
                taxpayer_state:     place.state ?? state,
                taxpayer_zip:       place.zip,
                primary_phone:      place.phone,
                website:            place.website,
                google_place_id:    place.place_id,
                google_maps_url:    place.google_maps_url,
                lead_source_label:  'google',
                status:             'new',
                starred:            false,
                score:              50,
                priority:           'good',
                last_seen_at:       new Date().toISOString(),
              },
              { onConflict: 'source,taxpayer_number,outlet_number', ignoreDuplicates: false }
            )
            .select('id')
            .single()

          if (insErr || !inserted) {
            // place_id unique index conflict = already imported
            if (insErr?.code === '23505') { skippedDup++ }
            else { console.error('[google-import] insert error', insErr) }
            continue
          }

          await db.from('lead_sources').upsert(
            {
              lead_id:       inserted.id,
              source_type:   'google_places',
              external_id:   place.place_id,
              source_url:    place.google_maps_url,
              search_run_id: runId,
              metadata:      { name: place.name, address: place.formatted_address, types: place.types },
            },
            { onConflict: 'lead_id,source_type' }
          )

          newLeads++
        }
      } catch (rowErr) {
        console.error('[google-import] row error', rowErr)
      }
    }

    // ── Update run with final counts ───────────────────────────────────────
    await db.from('google_search_runs').update({
      new_leads:      newLeads,
      enriched_leads: enrichedLeads,
      completed_at:   new Date().toISOString(),
    }).eq('id', runId)

    return NextResponse.json({
      run_id:        runId,
      new_leads:     newLeads,
      enriched_leads: enrichedLeads,
      skipped_dup:   skippedDup,
      no_phone:      noPhone,
      total:         results.length,
    })
  } catch (err) {
    console.error('[google-import]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
