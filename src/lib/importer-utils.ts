/**
 * Pure, side-effect-free helpers shared between the Next.js app and
 * the Supabase Edge Function importer.  No Supabase / Deno imports.
 */

/** Trim whitespace; return null for empty / null / undefined values. */
export function normalize(v: string | null | undefined): string | null {
  if (v == null) return null
  const s = v.trim()
  return s === '' ? null : s
}

/** Parse any ISO-ish date string to a YYYY-MM-DD string, or null. */
export function parseDate(v: string | null | undefined): string | null {
  if (!v) return null
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

/**
 * Compute the ISO cutoff timestamp string for `outlet_permit_issue_date >= …`.
 * Uses T00:00:00.000 so permits issued on the cutoff day are included.
 */
export function buildCutoffIso(daysToImport: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - daysToImport)
  return d.toISOString().slice(0, 10) + 'T00:00:00.000'
}

/**
 * Filter a raw list of county codes against a known-good allowlist.
 * Returns only codes present in the allowlist — never passes arbitrary strings.
 */
export function validateCountyCodes(
  codes: string[],
  allowlist: ReadonlySet<string> | Set<string>,
): string[] {
  return codes.filter(c => allowlist.has(c))
}

/**
 * Build the SoQL WHERE clause from validated inputs only.
 * `cutoffIso`   — output of buildCutoffIso (derived from integer arithmetic)
 * `validCodes`  — output of validateCountyCodes (fixed allowlist)
 */
export function buildSoQLWhere(cutoffIso: string, validCodes: string[]): string {
  if (!validCodes.length) throw new Error('validCodes must not be empty')
  const countyFilter = validCodes.map(c => `outlet_county_code='${c}'`).join(' OR ')
  return `outlet_permit_issue_date >= '${cutoffIso}' AND (${countyFilter})`
}

/**
 * Build a statewide (ALL Texas) SoQL WHERE clause — no county restriction.
 * Use this for the statewide import path.
 */
export function buildSoQLWhereStatewide(cutoffIso: string): string {
  return `outlet_permit_issue_date >= '${cutoffIso}'`
}

/** Allowlist of valid DFW-area county codes (mirrors the edge function constant). */
export const DFW_COUNTY_ALLOWLIST: ReadonlySet<string> = new Set([
  '043', '057', '061', '070', '111', '116', '126', '129', '184', '199', '213', '220', '249',
])

/**
 * Determine whether a raw Texas API record should be skipped.
 * Returns null if the record is processable, or a reason string if it should be skipped.
 */
export function skipReason(
  raw: Record<string, string>,
  allowlist: ReadonlySet<string> = DFW_COUNTY_ALLOWLIST,
): string | null {
  if (!normalize(raw.taxpayer_number)) return 'missing taxpayer_number'
  if (!normalize(raw.outlet_number)) return 'missing outlet_number'
  if (!parseDate(raw.outlet_permit_issue_date)) return 'missing or invalid outlet_permit_issue_date'
  const county = normalize(raw.outlet_county_code)
  if (!county || !allowlist.has(county)) return `invalid outlet_county_code: ${county}`
  return null
}

/** CRM fields that must never be overwritten during a reimport. */
export const CRM_PROTECTED_FIELDS = [
  'primary_phone',
  'primary_email',
  'website',
  'owner_name',
  'contact_title',
  'status',
  'starred',
  'next_follow_up_at',
  'last_contacted_at',
  'est_monthly_processing',
] as const
