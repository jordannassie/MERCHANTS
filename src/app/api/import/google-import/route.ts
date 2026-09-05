/**
 * POST /api/import/google-import
 *
 * Import step: saves Google Places search results to the DB.
 *   - Matched leads (existing state leads with same phone/place_id/name+addr):
 *       → enrich with google_place_id, google_maps_url, lead_source_label='both'
 *       → upsert a lead_sources row with source_type='google_places'
 *   - Unmatched leads (new Google-only):
 *       → insert new lead with source='google_places', lead_source_label='google'
 *       → insert a lead_sources row with source_type='google_places'
 *   - Logs the run to google_search_runs
 *
 * Body: { results: GooglePlacePreview[], state, location, query, zip }
 * Returns: { run_id, new_leads, enriched_leads, skipped, error? }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { googlePlaceToTaxpayerNumber, computeSourceLabel } from '@/lib/source-utils'
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
      zip?: string
    }

    const { results = [] } = body
    const state    = (body.state    || 'TX').trim().toUpperCase()
    const location = (body.location || '').trim()
    const query    = (body.query    || '').trim()
    const zip      = (body.zip      || '').trim()

    if (results.length === 0) {
      return NextResponse.json({ error: 'No results to import' }, { status: 400 })
    }

    // ── Create a search run log entry ──────────────────────────────────────
    const { data: runRow, error: runErr } = await db
      .from('google_search_runs')
      .insert({
        state,
        location: location || null,
        query,
        zip: zip || null,
        results_found: results.length,
      })
      .select('id')
      .single()

    if (runErr || !runRow) {
      console.error('[google-import] run insert error', runErr)
      return NextResponse.json({ error: 'Failed to create search run log' }, { status: 500 })
    }
    const runId = runRow.id as string

    let newLeads      = 0
    let enrichedLeads = 0
    let skipped       = 0

    // ── Process each result ────────────────────────────────────────────────
    for (const place of results) {
      try {
        if (place.matched_lead_id) {
          // ── Enrich existing lead with Google data ──────────────────────
          // Fetch current source label to compute the new one
          const { data: existing } = await db
            .from('leads')
            .select('lead_source_label')
            .eq('id', place.matched_lead_id)
            .single()

          const newLabel = computeSourceLabel(existing?.lead_source_label ?? null, true)

          const { error: upErr } = await db
            .from('leads')
            .update({
              google_place_id:  place.place_id,
              google_maps_url:  place.google_maps_url,
              lead_source_label: newLabel,
              // Enrich address / website if currently empty
              ...(place.website           ? { website: place.website }                  : {}),
              ...(place.phone             ? { permit_phone: place.phone }               : {}),
            })
            .eq('id', place.matched_lead_id)

          if (upErr) {
            console.error('[google-import] enrich error', upErr)
            skipped++
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
              metadata: {
                name:    place.name,
                address: place.formatted_address,
                types:   place.types,
              },
            },
            { onConflict: 'lead_id,source_type' }
          )

          enrichedLeads++
        } else {
          // ── Create new Google-only lead ────────────────────────────────
          const taxpayerNumber = googlePlaceToTaxpayerNumber(place.place_id)

          const { data: inserted, error: insErr } = await db
            .from('leads')
            .upsert(
              {
                source:              'google_places',
                taxpayer_number:     taxpayerNumber,
                outlet_number:       '0',
                display_name:        place.name,
                outlet_name:         place.name,
                outlet_address:      place.street_address,
                outlet_city:         place.city,
                outlet_state:        place.state ?? state,
                outlet_zip:          place.zip,
                outlet_county_code:  null, // No TX county code for Google leads
                taxpayer_city:       place.city,
                taxpayer_state:      place.state ?? state,
                taxpayer_zip:        place.zip,
                primary_phone:       place.phone,
                website:             place.website,
                google_place_id:     place.place_id,
                google_maps_url:     place.google_maps_url,
                lead_source_label:   'google',
                status:              'new',
                starred:             false,
                score:               50, // Default neutral score for Google leads
                priority:            'good',
              },
              { onConflict: 'source,taxpayer_number,outlet_number', ignoreDuplicates: false }
            )
            .select('id')
            .single()

          if (insErr || !inserted) {
            // Could be a place_id conflict (duplicate search run) — treat as skip
            if (insErr?.code === '23505') {
              skipped++
            } else {
              console.error('[google-import] insert error', insErr)
              skipped++
            }
            continue
          }

          const leadId = inserted.id as string

          // Insert lead_sources row
          await db.from('lead_sources').upsert(
            {
              lead_id:       leadId,
              source_type:   'google_places',
              external_id:   place.place_id,
              source_url:    place.google_maps_url,
              search_run_id: runId,
              metadata: {
                name:    place.name,
                address: place.formatted_address,
                types:   place.types,
              },
            },
            { onConflict: 'lead_id,source_type' }
          )

          newLeads++
        }
      } catch (rowErr) {
        console.error('[google-import] row error', rowErr)
        skipped++
      }
    }

    // ── Update run with final counts ───────────────────────────────────────
    await db
      .from('google_search_runs')
      .update({
        new_leads:      newLeads,
        enriched_leads: enrichedLeads,
        completed_at:   new Date().toISOString(),
      })
      .eq('id', runId)

    return NextResponse.json({
      run_id:        runId,
      new_leads:     newLeads,
      enriched_leads: enrichedLeads,
      skipped,
      total:         results.length,
    })
  } catch (err) {
    console.error('[google-import]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
