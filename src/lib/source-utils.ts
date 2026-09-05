/**
 * Source-matching and deduplication utilities.
 *
 * Dedup priority (per spec):
 *   1. Normalized phone number
 *   2. Google Place ID
 *   3. Normalized business name + normalized street address
 */

import type { GooglePlacePreview } from '@/lib/types'

// ── Normalization helpers ─────────────────────────────────────────────────────

/** Strip everything except digits; remove leading country code 1 if present. */
export function normalizePhoneForDedup(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  // Remove leading US country code
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/**
 * Validate that a string is a usable US phone number.
 * Accepts 10-digit local numbers or 11-digit numbers starting with 1.
 */
export function isValidUSPhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return true
  if (digits.length === 11 && digits.startsWith('1')) return true
  return false
}

/**
 * Normalize a US phone to 10 digits (strip country code).
 * Returns empty string if not a valid US number.
 */
export function normalizeUSPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return ''
}

/** Uppercase, collapse whitespace, strip punctuation for name matching. */
export function normalizeNameForDedup(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize a street address: uppercase, remove unit/suite/apt, collapse spaces. */
export function normalizeAddressForDedup(address: string | null | undefined): string {
  if (!address) return ''
  return address
    .toUpperCase()
    .replace(/\b(SUITE|STE|UNIT|APT|#)\s*\d+\w*/gi, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Candidate shape (minimal projection from DB query) ───────────────────────

export interface DedupeCandidate {
  id: string
  primary_phone: string | null
  permit_phone: string | null
  google_place_id: string | null
  display_name: string | null
  outlet_name: string | null
  outlet_address: string | null
  outlet_city: string | null
  lead_source_label: string | null
}

export type MatchType = 'phone' | 'place_id' | 'name_address'

export interface MatchResult {
  lead_id: string
  match_type: MatchType
  matched_business_name: string | null
}

/**
 * Try to match a Google Places preview against a list of existing DB leads.
 * Returns the first match found, or null if no match.
 */
export function matchGoogleToExistingLead(
  place: Omit<GooglePlacePreview, 'matched_lead_id' | 'match_type' | 'matched_business_name'>,
  candidates: DedupeCandidate[]
): MatchResult | null {
  const placePhone = normalizePhoneForDedup(place.phone)
  const placeName  = normalizeNameForDedup(place.name)
  const placeAddr  = normalizeAddressForDedup(place.street_address)
  const placeCity  = (place.city ?? '').toUpperCase().trim()

  // 1. Phone match (highest confidence)
  if (placePhone.length >= 10) {
    for (const c of candidates) {
      const phones = [c.primary_phone, c.permit_phone].map(normalizePhoneForDedup)
      if (phones.some(p => p === placePhone && p.length >= 10)) {
        return {
          lead_id: c.id,
          match_type: 'phone',
          matched_business_name: c.display_name ?? c.outlet_name,
        }
      }
    }
  }

  // 2. Google Place ID match
  if (place.place_id) {
    for (const c of candidates) {
      if (c.google_place_id && c.google_place_id === place.place_id) {
        return {
          lead_id: c.id,
          match_type: 'place_id',
          matched_business_name: c.display_name ?? c.outlet_name,
        }
      }
    }
  }

  // 3. Normalized name + city + street address match
  if (placeName && placeAddr && placeCity) {
    for (const c of candidates) {
      const cName = normalizeNameForDedup(c.display_name ?? c.outlet_name)
      const cAddr = normalizeAddressForDedup(c.outlet_address)
      const cCity = (c.outlet_city ?? '').toUpperCase().trim()

      if (cName === placeName && cAddr === placeAddr && cCity === placeCity) {
        return {
          lead_id: c.id,
          match_type: 'name_address',
          matched_business_name: c.display_name ?? c.outlet_name,
        }
      }
    }
  }

  return null
}

/**
 * Resolve dedup against existing DB leads for an array of Google previews.
 * Modifies previews in-place with match info, returns the same array.
 */
export function applyDedup(
  previews: Array<Omit<GooglePlacePreview, 'matched_lead_id' | 'match_type' | 'matched_business_name'>>,
  candidates: DedupeCandidate[]
): GooglePlacePreview[] {
  return previews.map(p => {
    const match = matchGoogleToExistingLead(p, candidates)
    return {
      ...p,
      matched_lead_id:        match?.lead_id        ?? null,
      match_type:             match?.match_type      ?? null,
      matched_business_name:  match?.matched_business_name ?? null,
    }
  })
}

/**
 * Generate a stable "taxpayer_number" for Google-only leads.
 * Uses the Google Place ID so the existing UNIQUE(source, taxpayer_number, outlet_number) constraint works.
 */
export function googlePlaceToTaxpayerNumber(placeId: string): string {
  return `GMAP:${placeId}`
}

/** Source label: given current label and which sources are being added, compute new label. */
export function computeSourceLabel(
  existing: string | null,
  addingGoogle: boolean
): 'state' | 'google' | 'both' {
  const isState  = existing === 'state' || existing === 'both'
  const isGoogle = existing === 'google' || existing === 'both' || addingGoogle
  if (isState && isGoogle) return 'both'
  if (isGoogle) return 'google'
  return 'state'
}
