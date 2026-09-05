/**
 * POST /api/import/google-search
 *
 * Searches Google Places for a single (location, query) pair and returns
 * results with dedup info against the existing DB.
 *
 * Phone is the primary requirement for a callable lead:
 *   - Returns text search results first (many include nationalPhoneNumber)
 *   - For phone-less results, fetches Place Details (up to MAX_DETAIL_FETCHES)
 *   - Filters final list to: callable (valid US phone + name + TX city)
 *
 * Body: { state, location, query, zip?, pageToken? }
 * Returns: {
 *   results: GooglePlacePreview[],   // callable only (have phone)
 *   callable_count: number,
 *   checked_count: number,           // raw Google results seen
 *   no_phone_count: number,          // filtered out — no valid US phone
 *   nextPageToken?: string,
 *   text_query: string,
 *   error?: string
 * }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { textSearchPlaces, rawToPreview, fetchPlacePhone } from '@/lib/google-places'
import { applyDedup, isValidUSPhone, type DedupeCandidate } from '@/lib/source-utils'

export const maxDuration = 30

// Max Place Detail fetches per search call (each costs ~$0.02 extra)
const MAX_DETAIL_FETCHES = 5

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

    // Build text search query: "restaurants Houston TX"
    const parts: string[] = [query]
    if (location) parts.push(location)
    if (state)    parts.push(state)
    if (zip)      parts.push(zip)
    const textQuery = parts.join(' ')

    // ── 1. Text Search ───────────────────────────────────────────────────────
    const searchResult = await textSearchPlaces(textQuery, 1, body.pageToken)  // 1 page = 20 results

    if (searchResult.error) {
      const { error } = searchResult
      const msg =
        error.type === 'not_configured' ? 'GOOGLE_MAPS_API_KEY is not configured.' :
        error.type === 'api_disabled'   ? `Google Places API not enabled. ${(error as {message:string}).message}` :
        error.type === 'quota_exceeded' ? 'Google Places quota exceeded. Try again later.' :
        (error as {message?: string}).message ?? 'Google Places search failed'
      return NextResponse.json({ error: msg }, { status: error.type === 'not_configured' ? 503 : 502 })
    }

    const checkedCount = searchResult.places.length

    // ── 2. Convert to preview shape ──────────────────────────────────────────
    const previews = searchResult.places.map(rawToPreview)

    // ── 3. Fetch phone details for phone-less results (up to MAX_DETAIL_FETCHES) ──
    let detailFetches = 0
    for (const p of previews) {
      if (p.phone || detailFetches >= MAX_DETAIL_FETCHES) continue
      const phone = await fetchPlacePhone(p.place_id)
      if (phone) p.phone = phone
      detailFetches++
    }

    // ── 4. Filter to callable only (valid US phone + name + state match) ─────
    const callable = previews.filter(p =>
      p.name &&
      isValidUSPhone(p.phone) &&
      // Accept results where state matches OR state wasn't parsed (formattedAddress may have TX)
      (!p.state || p.state === state || (p.formatted_address ?? '').toUpperCase().includes(state))
    )
    const noPhoneCount = checkedCount - callable.length

    if (callable.length === 0) {
      return NextResponse.json({
        results:        [],
        callable_count: 0,
        checked_count:  checkedCount,
        no_phone_count: noPhoneCount,
        nextPageToken:  searchResult.nextPageToken,
        text_query:     textQuery,
      })
    }

    // ── 5. Dedup against existing DB leads (city-scoped + place_id lookup) ───
    const db = createServiceClient()
    const cityName = location || state

    // Load candidates: city-scoped + place_id matches (efficient, avoids full table scan)
    const placeIds = callable.map(p => p.place_id).filter(Boolean)
    const [{ data: cityLeads }, { data: placeIdLeads }] = await Promise.all([
      db.from('leads')
        .select('id, primary_phone, permit_phone, google_place_id, display_name, outlet_name, outlet_address, outlet_city, lead_source_label')
        .or(`outlet_city.ilike.%${cityName.replace(/\s+TX$/i, '').trim()}%,taxpayer_city.ilike.%${cityName.replace(/\s+TX$/i, '').trim()}%`)
        .limit(3000),
      placeIds.length > 0
        ? db.from('leads')
            .select('id, primary_phone, permit_phone, google_place_id, display_name, outlet_name, outlet_address, outlet_city, lead_source_label')
            .in('google_place_id', placeIds)
        : Promise.resolve({ data: [] as DedupeCandidate[] }),
    ])

    // Merge + deduplicate candidates by id
    const allCandidates = [
      ...((cityLeads ?? []) as DedupeCandidate[]),
      ...((placeIdLeads ?? []) as DedupeCandidate[]),
    ]
    const candidateMap = new Map<string, DedupeCandidate>()
    for (const c of allCandidates) candidateMap.set(c.id, c)
    const candidates = [...candidateMap.values()]

    const matched = applyDedup(callable, candidates)

    return NextResponse.json({
      results:        matched,
      callable_count: matched.length,
      checked_count:  checkedCount,
      no_phone_count: noPhoneCount,
      nextPageToken:  searchResult.nextPageToken,
      text_query:     textQuery,
    })
  } catch (err) {
    console.error('[google-search]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
