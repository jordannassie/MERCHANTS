/**
 * POST /api/import/google-search
 *
 * Preview step: searches Google Places and returns results with match info
 * against existing DB leads. Does NOT save anything.
 *
 * Body: { state, location, query, zip?, pageToken? }
 * Returns: { results: GooglePlacePreview[], nextPageToken?, count, error? }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { textSearchPlaces, rawToPreview } from '@/lib/google-places'
import { applyDedup, type DedupeCandidate } from '@/lib/source-utils'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      state?: string
      location?: string
      query?: string
      zip?: string
      pageToken?: string
    }

    const state    = (body.state    || 'TX').trim().toUpperCase()
    const location = (body.location || '').trim()
    const query    = (body.query    || '').trim()
    const zip      = (body.zip      || '').trim()

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    // Build a rich text query: "restaurants in Houston TX 77001"
    const parts: string[] = [query]
    if (location) parts.push(location)
    if (state)    parts.push(state)
    if (zip)      parts.push(zip)
    const textQuery = parts.join(' ')

    // Search Google Places
    const searchResult = await textSearchPlaces(textQuery, 3, body.pageToken)

    if (searchResult.error) {
      const { error } = searchResult
      if (error.type === 'not_configured') {
        return NextResponse.json(
          { error: 'Google Maps API key is not configured. Add GOOGLE_MAPS_API_KEY to your environment variables.' },
          { status: 503 }
        )
      }
      if (error.type === 'api_disabled') {
        return NextResponse.json(
          { error: `Google Places API is not enabled on your project. Enable it at console.cloud.google.com → APIs → Places API (New). Details: ${error.message}` },
          { status: 503 }
        )
      }
      return NextResponse.json(
        { error: error.type === 'quota_exceeded' ? 'Google Places quota exceeded. Try again later.' : (error as { message?: string }).message ?? 'Google Places search failed' },
        { status: 502 }
      )
    }

    // Convert raw results to our preview shape
    const previews = searchResult.places.map(rawToPreview)

    // Load existing leads for dedup — fetch a broad set of candidates
    // We match by: phone, place_id, name+address
    const db = createServiceClient()
    const { data: candidates } = await db
      .from('leads')
      .select('id, primary_phone, permit_phone, google_place_id, display_name, outlet_name, outlet_address, outlet_city, lead_source_label')
      .limit(50000) as { data: DedupeCandidate[] | null }

    const matched = applyDedup(previews, candidates ?? [])

    return NextResponse.json({
      results:        matched,
      nextPageToken:  searchResult.nextPageToken,
      count:          matched.length,
      text_query:     textQuery,
    })
  } catch (err) {
    console.error('[google-search]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
