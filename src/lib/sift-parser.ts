/**
 * Parser for Texas Comptroller SIFT weekly new-permit phone files.
 *
 * Verified layout from stp08-31ph.csv (22 columns, NO header row):
 *
 *   [0]  taxpayer_number           — 11-digit string (e.g. "32067339831")
 *   [1]  outlet_number             — e.g. "00001", "00002", "00000" (USE TAX)
 *   [2]  taxpayer_name
 *   [3]  taxpayer_address
 *   [4]  taxpayer_city
 *   [5]  taxpayer_state
 *   [6]  taxpayer_zip_code
 *   [7]  taxpayer_county_code
 *   [8]  taxpayer_phone            ← FALLBACK PHONE (col 8)
 *   [9]  outlet_name
 *   [10] outlet_address
 *   [11] outlet_city
 *   [12] outlet_state
 *   [13] outlet_zip_code
 *   [14] outlet_county_code
 *   [15] telephone                 ← PRIMARY PHONE / outlet location phone (col 15)
 *   [16] taxpayer_type             — "SALES TAX" | "USE TAX" | "DIRECT PAY"
 *   [17] state_code                — numeric
 *   [18] outlet_naics_code
 *   [19] outlet_permit_issue_date  — YYYYMMDD
 *   [20] outlet_first_sales_date   — YYYYMMDD
 *   [21] (empty trailing field)
 *
 * Phone strategy (fallback):
 *   best_phone = col-15 (telephone) if valid
 *                ELSE col-8 (taxpayer_phone) if valid
 *                ELSE null
 *
 * This yields ~4,561 rows with at least one valid phone from 4,589 total rows.
 *
 * Outlet-number normalization:
 *   - Strip non-digits, parseInt → String.
 *   - "00001" → "1", "00002" → "2"
 *   - "00000" → "0"  (USE TAX records — valid, NOT skipped)
 *   - ""      → ""   (truly blank — only ~1 DIRECT PAY row; skipped)
 *
 * Match key: taxpayer_number (col 0) + outlet_number (col 1, normalized).
 * Taxpayer numbers are kept as strings — never cast to JS Number.
 */

// Known phone column header variants (for header-detected files)
const PHONE_COLUMN_CANDIDATES = [
  'telephone', 'phone', 'phone_number', 'taxpayer_phone',
  'outlet_phone', 'contact_phone', 'tel', 'phone_no',
]

// Verified 22-column fixed layout (no header row in production files)
const FIXED_COLUMN_ORDER = [
  'taxpayer_number',            // [0]
  'outlet_number',              // [1]
  'taxpayer_name',              // [2]
  'taxpayer_address',           // [3]
  'taxpayer_city',              // [4]
  'taxpayer_state',             // [5]
  'taxpayer_zip_code',          // [6]
  'taxpayer_county_code',       // [7]
  'taxpayer_phone',             // [8]  ← FALLBACK PHONE
  'outlet_name',                // [9]
  'outlet_address',             // [10]
  'outlet_city',                // [11]
  'outlet_state',               // [12]
  'outlet_zip_code',            // [13]
  'outlet_county_code',         // [14]
  'telephone',                  // [15] ← PRIMARY PHONE (outlet/location phone)
  'taxpayer_type',              // [16] — "SALES TAX", "USE TAX", "DIRECT PAY"
  'state_code',                 // [17]
  'outlet_naics_code',          // [18]
  'outlet_permit_issue_date',   // [19]
  'outlet_first_sales_date',    // [20]
  // [21] empty trailing field
]

// Fixed column indices (never changes for headerless files)
const COL_TAXPAYER_NUMBER  = 0
const COL_OUTLET_NUMBER    = 1
const COL_TAXPAYER_PHONE   = 8   // fallback phone
const COL_TELEPHONE        = 15  // primary/outlet phone
const COL_TAXPAYER_TYPE    = 16

export interface SiftPermitRow {
  taxpayerNumber:  string        // normalized 11-digit string, no JS Number cast
  outletNumber:    string        // normalized: "1", "2", "0" (for 00000), ""=blank
  outletNumberRaw: string        // raw value from CSV (for diagnostics)
  taxpayerPhone:   string | null // raw col-8 value; null if blank
  outletPhone:     string | null // raw col-15 value; null if blank
  phone:           string | null // best_phone = outletPhone || taxpayerPhone
  permitType:      string        // "SALES TAX" | "USE TAX" | "DIRECT PAY" | ""
  rowNum:          number
}

export interface SiftParseSkipReasons {
  missingTaxpayerNumber: number
  blankOutletNumber:     number  // truly empty outlet (not 00000) — ~1 row
  malformedRow:          number  // fewer than 16 columns
}

export interface SiftParseResult {
  rows:          SiftPermitRow[]
  format:        'header' | 'positional' | 'empty'
  phoneColFound: boolean        // true when col 15 was located
  skipReasons:   SiftParseSkipReasons
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split a single delimited line into fields (RFC-4180 CSV, or tab/pipe fallback).
 */
export function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(f => f.trim())
  if (line.includes('|'))  return line.split('|').map(f => f.trim())
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
 *
 *   "00001" → "1"
 *   "00002" → "2"
 *   "00000" → "0"   ← USE TAX records; valid, NOT the same as blank
 *   ""      → ""    ← truly blank (only ~1 row); caller decides to skip
 *
 * IMPORTANT: we do NOT return "" for n===0 — that would wrongly discard
 * ~251 USE TAX records whose outlet_number is legitimately "00000".
 */
export function normalizeOutletNumber(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''                    // truly blank
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''                     // contained no digits at all
  const n = parseInt(digits, 10)
  if (isNaN(n)) return ''
  return String(n)                           // "00000"→"0", "00001"→"1", etc.
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse the full text of a SIFT permit-phone file.
 *
 * Applies phone fallback: col-15 (outlet/location phone) first,
 * then col-8 (taxpayer phone) when col-15 is blank or zero.
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

  // ── Detect header row ─────────────────────────────────────────────────────
  let hasHeader = false
  let phoneColIdx       = COL_TELEPHONE       // col 15 — primary/outlet phone
  let taxpayerPhoneIdx  = COL_TAXPAYER_PHONE  // col 8  — fallback phone
  let taxpayerColIdx    = COL_TAXPAYER_NUMBER // col 0
  let outletColIdx      = COL_OUTLET_NUMBER   // col 1
  let taxpayerTypeIdx   = COL_TAXPAYER_TYPE   // col 16
  let format: 'header' | 'positional' = 'positional'

  const lowerFirst = firstFields.map(f => f.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  if (
    lowerFirst.includes('taxpayer_number') ||
    lowerFirst.includes('taxpayer_id') ||
    lowerFirst.includes('taxpayernumber')
  ) {
    hasHeader        = true
    taxpayerColIdx   = lowerFirst.findIndex(f => f.includes('taxpayer_number') || f.includes('taxpayer_id'))
    outletColIdx     = lowerFirst.findIndex(f => f.includes('outlet_number') || f.includes('location_number'))
    taxpayerTypeIdx  = lowerFirst.findIndex(f => f.includes('taxpayer_type') || f.includes('permit_type'))

    // Prefer bare 'telephone' for the outlet/primary phone column
    const exactPhone = lowerFirst.findIndex(f => f === 'telephone' || f === 'phone' || f === 'tel')
    if (exactPhone >= 0) {
      phoneColIdx = exactPhone
    } else {
      let found = -1
      for (const cand of PHONE_COLUMN_CANDIDATES) {
        const idx = lowerFirst.findIndex(f => f === cand)
        if (idx >= 0) { found = idx; break }
      }
      if (found < 0) {
        found = lowerFirst.findIndex(f => PHONE_COLUMN_CANDIDATES.some(p => f.includes(p)))
      }
      phoneColIdx = found
    }

    // For header files, try to find taxpayer_phone column separately
    const tpIdx = lowerFirst.findIndex(f => f === 'taxpayer_phone' || f === 'taxpayerphone')
    if (tpIdx >= 0) taxpayerPhoneIdx = tpIdx

    format = 'header'
  }

  // ── Parse data rows ───────────────────────────────────────────────────────
  const dataLines = hasHeader ? lines.slice(1) : lines
  const maxRows   = limit ?? dataLines.length
  const rows: SiftPermitRow[] = []
  const skip = { missingTaxpayerNumber: 0, blankOutletNumber: 0, malformedRow: 0 }

  for (let i = 0; i < Math.min(dataLines.length, maxRows); i++) {
    const line = dataLines[i]
    if (!line.trim()) continue
    const fields = splitLine(line)

    // Positional files must have at least 16 columns (through col 15 = telephone)
    if (!hasHeader && fields.length < 16) {
      skip.malformedRow++
      continue
    }

    const taxpayerRaw    = fields[taxpayerColIdx]  ?? ''
    const outletRaw      = (fields[outletColIdx]   ?? '').trim()
    const outletPhoneRaw = phoneColIdx >= 0 ? (fields[phoneColIdx]      ?? '').trim() : ''
    const taxpayerPhRaw  = taxpayerPhoneIdx >= 0  ? (fields[taxpayerPhoneIdx] ?? '').trim() : ''
    const permitTypeRaw  = taxpayerTypeIdx >= 0   ? (fields[taxpayerTypeIdx]  ?? '').trim() : ''

    // ── Validate taxpayer number ──────────────────────────────────────────
    const taxpayerNumber = normalizeTaxpayerNumber(taxpayerRaw)
    if (!taxpayerNumber) { skip.missingTaxpayerNumber++; continue }

    // ── Normalize outlet number ───────────────────────────────────────────
    const outletNumber = normalizeOutletNumber(outletRaw)
    // Only skip TRULY blank outlet numbers (empty string after normalization
    // AND the raw value was also blank/whitespace). "00000" → "0" → NOT skipped.
    if (outletNumber === '' && !outletRaw.replace(/\D/g, '')) {
      skip.blankOutletNumber++
      continue
    }

    // ── Phone extraction with fallback ────────────────────────────────────
    // Treat stubs like "0", "0      0", "0000000000" as absent.
    // A raw phone of just zeros or empty → null.
    const cleanPhoneRaw = (raw: string): string | null => {
      if (!raw) return null
      // Strip all non-digit characters to check if it's all zeros or empty
      const digits = raw.replace(/\D/g, '')
      if (!digits || /^0+$/.test(digits)) return null
      return raw   // keep the original string for normalizePhone() later
    }

    const outletPhone   = cleanPhoneRaw(outletPhoneRaw)
    const taxpayerPhone = cleanPhoneRaw(taxpayerPhRaw)
    // Best phone: outlet first, taxpayer as fallback
    const bestPhone = outletPhone ?? taxpayerPhone

    rows.push({
      taxpayerNumber,
      outletNumber,
      outletNumberRaw: outletRaw,
      taxpayerPhone,
      outletPhone,
      phone:      bestPhone,
      permitType: permitTypeRaw,
      rowNum:     i + (hasHeader ? 2 : 1),
    })
  }

  return {
    rows,
    format,
    phoneColFound: phoneColIdx >= 0,
    skipReasons: skip,
  }
}
