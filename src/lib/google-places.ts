/**
 * Google Places API (New) — contact matching for Texas leads.
 * SERVER-ONLY. GOOGLE_MAPS_API_KEY must never be exposed to the browser.
 */

const PLACES_BASE = 'https://places.googleapis.com/v1'

export interface PlaceCandidate {
  id: string
  displayName: string
  formattedAddress: string
  primaryType: string | null
  businessStatus: string | null
  nationalPhoneNumber: string | null
  internationalPhoneNumber: string | null
  websiteUri: string | null
  googleMapsUri: string | null
  types: string[] | null
  confidence: number
}

export interface PlacesMatchResult {
  status: 'found' | 'review' | 'not_found' | 'error'
  best: PlaceCandidate | null
  candidates: PlaceCandidate[]
  error?: string
}

// ── Normalisation helpers ────────────────────────────────────────────────────

function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(llc|inc|corp|co|ltd|dba|the|&|and)\b\.?/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normaliseAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|pkwy|parkway|ste|suite|#)\b\.?/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Simple bigram similarity in [0,1]. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const ba = bigrams(a)
  const bb = bigrams(b)
  let inter = 0
  ba.forEach(g => { if (bb.has(g)) inter++ })
  return (2 * inter) / (ba.size + bb.size) || 0
}

/** Extract the leading street number from an address string. */
function streetNumber(addr: string): string | null {
  const m = addr.trim().match(/^(\d+)/)
  return m ? m[1] : null
}

/**
 * Calculate match confidence (0–100) between a Texas lead and a Google Places result.
 */
export function calculateConfidence(
  lead: {
    display_name: string | null
    outlet_name: string | null
    taxpayer_name: string | null
    outlet_address: string | null
    outlet_city: string | null
    outlet_zip: string | null
  },
  place: { displayName: string; formattedAddress: string }
): number {
  const leadName = normaliseName(
    lead.outlet_name ?? lead.display_name ?? lead.taxpayer_name ?? ''
  )
  const placeName = normaliseName(place.displayName)
  const nameSim = similarity(leadName, placeName)

  const leadAddr = normaliseAddress(lead.outlet_address ?? '')
  const placeAddr = normaliseAddress(place.formattedAddress)
  const addrSim = similarity(leadAddr, placeAddr)

  // Street number must match if both are present
  const leadNum = streetNumber(lead.outlet_address ?? '')
  const placeNum = streetNumber(place.formattedAddress)
  const numberMatch = leadNum && placeNum ? leadNum === placeNum : true

  // ZIP
  const zip = lead.outlet_zip ?? ''
  const zipMatch = zip && place.formattedAddress.includes(zip) ? 1 : 0

  // City
  const city = (lead.outlet_city ?? '').toLowerCase()
  const cityMatch = city && place.formattedAddress.toLowerCase().includes(city) ? 1 : 0

  // Weighted scoring: name matters but address/ZIP/city are critical
  let score =
    nameSim * 30 +        // 30 pts for name similarity
    addrSim * 25 +        // 25 pts for address similarity
    zipMatch * 25 +       // 25 pts for ZIP match
    cityMatch * 15 +      // 15 pts for city match
    (numberMatch ? 5 : -20)  // -20 penalty if street numbers conflict

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)))
  return score
}

// ── API calls ────────────────────────────────────────────────────────────────

const SEARCH_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.primaryType,places.businessStatus'

const DETAIL_FIELD_MASK =
  'id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,businessStatus,primaryType,types'

async function searchPlaces(query: string, apiKey: string): Promise<Array<{
  id: string
  displayName: { text: string }
  formattedAddress: string
  primaryType?: string
  businessStatus?: string
}>> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 5,
      locationBias: {
        circle: {
          center: { latitude: 32.8, longitude: -97.1 }, // DFW centroid
          radius: 80000, // 80 km
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Places searchText ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.places ?? []
}

async function getPlaceDetail(placeId: string, apiKey: string): Promise<PlaceCandidate | null> {
  const res = await fetch(`${PLACES_BASE}/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': DETAIL_FIELD_MASK,
    },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const d = await res.json()
  return {
    id: d.id ?? placeId,
    displayName: d.displayName?.text ?? '',
    formattedAddress: d.formattedAddress ?? '',
    primaryType: d.primaryType ?? null,
    businessStatus: d.businessStatus ?? null,
    nationalPhoneNumber: d.nationalPhoneNumber ?? null,
    internationalPhoneNumber: d.internationalPhoneNumber ?? null,
    websiteUri: d.websiteUri ?? null,
    googleMapsUri: d.googleMapsUri ?? null,
    types: d.types ?? null,
    confidence: 0, // will be filled by caller
  }
}

// ── Main exported function ───────────────────────────────────────────────────

export interface LeadForSearch {
  id: string
  display_name: string | null
  outlet_name: string | null
  taxpayer_name: string | null
  outlet_address: string | null
  outlet_city: string | null
  outlet_state: string | null
  outlet_zip: string | null
  primary_phone: string | null
  website: string | null
}

/**
 * Find the best Google Places match for a Texas lead.
 * - confidence ≥ 85 → auto-save recommended
 * - confidence 60–84 → show review dialog
 * - confidence < 60 → not found
 */
export async function findPlacesContact(
  lead: LeadForSearch,
  apiKey: string
): Promise<PlacesMatchResult> {
  const name = lead.outlet_name ?? lead.display_name ?? lead.taxpayer_name ?? ''
  if (!name) return { status: 'not_found', best: null, candidates: [] }

  const query = [
    name,
    lead.outlet_address,
    lead.outlet_city,
    lead.outlet_state ?? 'TX',
    lead.outlet_zip,
  ]
    .filter(Boolean)
    .join(', ')

  let searchResults: Awaited<ReturnType<typeof searchPlaces>> = []
  try {
    searchResults = await searchPlaces(query, apiKey)
  } catch (e) {
    return {
      status: 'error',
      best: null,
      candidates: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }

  if (!searchResults.length) {
    return { status: 'not_found', best: null, candidates: [] }
  }

  // Score all candidates (without detail yet)
  const scored = searchResults
    .map(p => ({
      id: p.id,
      displayName: p.displayName?.text ?? '',
      formattedAddress: p.formattedAddress,
      primaryType: p.primaryType ?? null,
      businessStatus: p.businessStatus ?? null,
      confidence: calculateConfidence(lead, {
        displayName: p.displayName?.text ?? '',
        formattedAddress: p.formattedAddress,
      }),
    }))
    .sort((a, b) => b.confidence - a.confidence)

  const best = scored[0]

  // Fetch full detail for the best candidate only
  let detail: PlaceCandidate | null = null
  try {
    detail = await getPlaceDetail(`places/${best.id}`, apiKey)
  } catch {
    // If detail fetch fails, still return what we have
  }

  const bestFull: PlaceCandidate = detail
    ? { ...detail, confidence: best.confidence }
    : {
        id: best.id,
        displayName: best.displayName,
        formattedAddress: best.formattedAddress,
        primaryType: best.primaryType,
        businessStatus: best.businessStatus,
        nationalPhoneNumber: null,
        internationalPhoneNumber: null,
        websiteUri: null,
        googleMapsUri: null,
        types: null,
        confidence: best.confidence,
      }

  const candidates: PlaceCandidate[] = scored.slice(0, 3).map((s, i) =>
    i === 0 ? bestFull : {
      id: s.id,
      displayName: s.displayName,
      formattedAddress: s.formattedAddress,
      primaryType: s.primaryType,
      businessStatus: s.businessStatus,
      nationalPhoneNumber: null,
      internationalPhoneNumber: null,
      websiteUri: null,
      googleMapsUri: null,
      types: null,
      confidence: s.confidence,
    }
  )

  if (best.confidence >= 85) {
    return { status: 'found', best: bestFull, candidates }
  } else if (best.confidence >= 60) {
    return { status: 'review', best: bestFull, candidates }
  } else {
    return { status: 'not_found', best: null, candidates }
  }
}
