/**
 * Parser for Texas Comptroller SIFT weekly new-permit phone files.
 *
 * Verified layout from stp08-31ph.csv (22 columns, no header row):
 *   [0]  taxpayer_number           — 11-digit string
 *   [1]  outlet_number             — e.g. "00001", "00002", or "" (DIRECT PAY)
 *   [2]  taxpayer_name
 *   [3]  taxpayer_address
 *   [4]  taxpayer_city
 *   [5]  taxpayer_state
 *   [6]  taxpayer_zip_code
 *   [7]  taxpayer_county_code
 *   [8]  taxpayer_phone
 *   [9]  outlet_name
 *   [10] outlet_address
 *   [11] outlet_city
 *   [12] outlet_state
 *   [13] outlet_zip_code
 *   [14] outlet_county_code
 *   [15] telephone  ← PERMIT PHONE (the field this file exists to deliver)
 *   [16] taxpayer_type             — "SALES TAX", "DIRECT PAY", etc.
 *   [17] state_code                — numeric (unquoted)
 *   [18] outlet_naics_code
 *   [19] outlet_permit_issue_date  — YYYYMMDD
 *   [20] outlet_first_sales_date   — YYYYMMDD
 *   [21] (empty trailing field)
 *
 * Match key: taxpayer_number (col 0) + outlet_number (col 1).
 * Never match by name or address alone.
 *
 * Outlet-number normalization: strip non-digits → parseInt → String.
 * "00001", "1", "00000001" all normalize to "1" and will match the same lead.
 * Taxpayer numbers are kept as-is strings (11 digits); never cast to JS Number.
 */

// Known phone column header variants (for header-detected files)
const PHONE_COLUMN_CANDIDATES = [
  'telephone', 'phone', 'phone_number', 'taxpayer_phone',
  'outlet_phone', 'contact_phone', 'tel', 'phone_no',
]

// Verified 22-column fixed layout (no header row in production files)
const FIXED_COLUMN_ORDER = [
  'taxpayer_number',            // [0]
  'outlet_number',              // [1]  ← was incorrectly at index 8 before
  'taxpayer_name',              // [2]
  'taxpayer_address',           // [3]
  'taxpayer_city',              // [4]
  'taxpayer_state',             // [5]
  'taxpayer_zip_code',          // [6]
  'taxpayer_county_code',       // [7]
  'taxpayer_phone',             // [8]
  'outlet_name',                // [9]
  'outlet_address',             // [10]
  'outlet_city',                // [11]
  'outlet_state',               // [12]
  'outlet_zip_code',            // [13]
  'outlet_county_code',         // [14]
  'telephone',                  // [15] ← PERMIT PHONE (was incorrectly at index 19)
  'taxpayer_type',              // [16]
  'state_code',                 // [17]
  'outlet_naics_code',          // [18]
  'outlet_permit_issue_date',   // [19]
  'outlet_first_sales_date',    // [20]
  // [21] empty trailing field
]

export interface SiftPermitRow {
  taxpayerNumber: string   // normalized 11-digit string, no JS Number cast
  outletNumber: string     // normalized to integer string ("1", "2", …)
  outletNumberRaw: string  // raw value from CSV for diagnostics
  phone: string | null     // raw phone string from col 15; null if blank/stub
  rowNum: number
}

export interface SiftParseSkipReasons {
  missingTaxpayerNumber: number
  blankOutletNumber: number   // DIRECT PAY or other blank-outlet rows
  malformedRow: number        // wrong number of columns
}

export interface SiftParseResult {
  rows: SiftPermitRow[]
  format: 'header' | 'positional' | 'empty'
  phoneColFound: boolean
  skipReasons: SiftParseSkipReasons
}

/**
 * Split a single delimited line into fields (RFC-4180 CSV, or tab/pipe fallback).
 */
export function splitLine(line: string): string[] {
  // Try tab first (some SIFT files are tab-delimited)
  if (line.includes('\t')) return line.split('\t').map(f => f.trim())
  // Try pipe
  if (line.includes('|')) return line.split('|').map(f => f.trim())
  // Full RFC-4180 CSV
  const fields: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ; continue }
    if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  fields.push(cur.trim())
  return fields
}

/**
 * Normalize a taxpayer_number to an 11-digit string.
 * Strips all non-digit characters, then pads with leading zeros to 11 digits.
 * NEVER converts to a JS Number — 11-digit values exceed safe integer range.
 */
export function normalizeTaxpayerNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits || digits === '00000000000') return ''
  return digits.padStart(11, '0')
}

/**
 * Normalize an outlet_number for flexible matching.
 * Converts "00001", "0001", "1", "00000001" → "1"
 * Returns "" for blank/whitespace-only input (DIRECT PAY rows).
 */
export function normalizeOutletNumber(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const n = parseInt(digits, 10)
  if (isNaN(n) || n === 0) return ''
  return String(n)
}

/**
 * Parse the full text of a SIFT permit-phone file.
 */
export function parseSiftFile(text: string, limit?: number): SiftParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) {
    return {
      rows: [],
      format: 'empty',
      phoneColFound: false,
      skipReasons: { missingTaxpayerNumber: 0, blankOutletNumber: 0, malformedRow: 0 },
    }
  }

  const firstFields = splitLine(lines[0])
  let hasHeader = false
  let phoneColIdx = FIXED_COLUMN_ORDER.indexOf('telephone')       // 15
  let taxpayerColIdx = FIXED_COLUMN_ORDER.indexOf('taxpayer_number') // 0
  let outletColIdx = FIXED_COLUMN_ORDER.indexOf('outlet_number')   // 1
  let format: 'header' | 'positional' = 'positional'

  // Detect header row by looking for known field names
  const lowerFirst = firstFields.map(f => f.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  if (
    lowerFirst.includes('taxpayer_number') ||
    lowerFirst.includes('taxpayer_id') ||
    lowerFirst.includes('taxpayernumber')
  ) {
    hasHeader = true
    taxpayerColIdx = lowerFirst.findIndex(f => f.includes('taxpayer_number') || f.includes('taxpayer_id'))
    outletColIdx   = lowerFirst.findIndex(f => f.includes('outlet_number') || f.includes('location_number'))

    // Prefer the bare 'telephone' column when present (the permit phone column).
    // Fall back to iterating PHONE_COLUMN_CANDIDATES with exact then substring matching
    // to avoid picking 'taxpayer_phone' over 'telephone'.
    const exactPhone = lowerFirst.findIndex(f => f === 'telephone' || f === 'phone' || f === 'tel')
    if (exactPhone >= 0) {
      phoneColIdx = exactPhone
    } else {
      // Exact match against each candidate
      let found = -1
      for (const cand of PHONE_COLUMN_CANDIDATES) {
        const idx = lowerFirst.findIndex(f => f === cand)
        if (idx >= 0) { found = idx; break }
      }
      // Substring fallback
      if (found < 0) {
        found = lowerFirst.findIndex(f => PHONE_COLUMN_CANDIDATES.some(p => f.includes(p)))
      }
      phoneColIdx = found
    }
    format = 'header'
  }

  const dataLines = hasHeader ? lines.slice(1) : lines
  const maxRows = limit ?? dataLines.length
  const rows: SiftPermitRow[] = []
  const skip = { missingTaxpayerNumber: 0, blankOutletNumber: 0, malformedRow: 0 }

  for (let i = 0; i < Math.min(dataLines.length, maxRows); i++) {
    const line = dataLines[i]
    if (!line.trim()) continue
    const fields = splitLine(line)

    // Sanity check: positional files should have at least 16 columns
    if (!hasHeader && fields.length < 16) {
      skip.malformedRow++
      continue
    }

    const taxpayerRaw = fields[taxpayerColIdx] ?? ''
    const outletRaw   = (fields[outletColIdx] ?? '').trim()
    const phoneRaw    = phoneColIdx >= 0 ? (fields[phoneColIdx] ?? '').trim() : ''

    const taxpayerNumber = normalizeTaxpayerNumber(taxpayerRaw)
    if (!taxpayerNumber) { skip.missingTaxpayerNumber++; continue }

    const outletNumber = normalizeOutletNumber(outletRaw)
    // DIRECT PAY permits have a blank outlet_number — skip them, they won't
    // match any lead we're tracking (our import skips blank outlet rows too)
    if (!outletNumber) { skip.blankOutletNumber++; continue }

    // A phone of "0      0" or similar stub → keep as null (validated in route)
    const phone = phoneRaw || null

    rows.push({
      taxpayerNumber,
      outletNumber,
      outletNumberRaw: outletRaw,
      phone,
      rowNum: i + (hasHeader ? 2 : 1),
    })
  }

  return {
    rows,
    format,
    phoneColFound: phoneColIdx >= 0,
    skipReasons: skip,
  }
}
