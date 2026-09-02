/**
 * Parser for Texas Comptroller SIFT weekly new-permit phone files.
 *
 * The weekly "ph" variant (stpMM-DDph.zip) contains a text file with 20 columns
 * — the standard 19-column Socrata layout plus a telephone column at position 20.
 *
 * Match key: taxpayer_number (col 1) + outlet_number (col 9).
 * Never use name or address alone for matching.
 */

// Known phone column header variants the TX Comptroller file might use
const PHONE_COLUMN_CANDIDATES = [
  'telephone', 'phone', 'phone_number', 'taxpayer_phone',
  'outlet_phone', 'contact_phone', 'tel', 'phone_no',
]

// The 20-column field order for the ph variant (used when file has no header row)
const FIXED_COLUMN_ORDER = [
  'taxpayer_number', 'taxpayer_name', 'taxpayer_address', 'taxpayer_city',
  'taxpayer_state', 'taxpayer_zip_code', 'taxpayer_county_code',
  'taxpayer_organization_type', 'outlet_number', 'outlet_name',
  'outlet_address', 'outlet_city', 'outlet_state', 'outlet_zip_code',
  'outlet_county_code', 'outlet_naics_code',
  'outlet_inside_outside_city_limits_indicator',
  'outlet_permit_issue_date', 'outlet_first_sales_date',
  'telephone', // column 20 — present only in the ph file
]

export interface SiftPermitRow {
  taxpayerNumber: string
  outletNumber: string
  phone: string | null
  rowNum: number
}

export interface SiftParseResult {
  rows: SiftPermitRow[]
  format: 'header' | 'positional' | 'empty'
  phoneColFound: boolean
}

/**
 * Split a single delimited line into fields.
 * Tries tab, pipe, then full RFC-4180 CSV in that order.
 */
function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(f => f.trim())
  if (line.includes('|'))  return line.split('|').map(f => f.trim())
  // CSV: handle quoted fields
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
 * Parse the full text of a SIFT permit-phone file.
 *
 * @param text  The raw file contents as a UTF-8 string.
 * @param limit Optional row limit for testing (omit to parse all rows).
 */
export function parseSiftFile(text: string, limit?: number): SiftParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { rows: [], format: 'empty', phoneColFound: false }

  const firstFields = splitLine(lines[0])
  let hasHeader = false
  let phoneColIdx = -1
  let taxpayerColIdx = 0
  let outletColIdx = 8
  let format: 'header' | 'positional' = 'positional'

  // Detect header row by looking for taxpayer_number / similar
  const lowerFirst = firstFields.map(f => f.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  if (
    lowerFirst.includes('taxpayer_number') ||
    lowerFirst.includes('taxpayer_id') ||
    lowerFirst.includes('taxpayernumber')
  ) {
    hasHeader = true
    taxpayerColIdx = lowerFirst.findIndex(f => f.includes('taxpayer_number') || f.includes('taxpayer_id'))
    outletColIdx   = lowerFirst.findIndex(f => f.includes('outlet_number') || f.includes('location_number'))
    phoneColIdx    = lowerFirst.findIndex(f => PHONE_COLUMN_CANDIDATES.some(p => f.includes(p)))
    format = 'header'
  } else {
    taxpayerColIdx = FIXED_COLUMN_ORDER.indexOf('taxpayer_number')
    outletColIdx   = FIXED_COLUMN_ORDER.indexOf('outlet_number')
    phoneColIdx    = FIXED_COLUMN_ORDER.indexOf('telephone')
    format = 'positional'
  }

  const dataLines = hasHeader ? lines.slice(1) : lines
  const maxRows = limit ?? dataLines.length
  const rows: SiftPermitRow[] = []

  for (let i = 0; i < Math.min(dataLines.length, maxRows); i++) {
    const line = dataLines[i]
    if (!line.trim()) continue
    const fields = splitLine(line)

    const taxpayerRaw = fields[taxpayerColIdx] ?? ''
    const outletRaw   = fields[outletColIdx] ?? ''
    const phoneRaw    = phoneColIdx >= 0 ? (fields[phoneColIdx] ?? '') : ''

    const taxpayerNumber = taxpayerRaw.replace(/\D/g, '').padStart(11, '0')
    const outletNumber   = outletRaw.replace(/\D/g, '').padStart(4, '0')

    if (!taxpayerNumber || taxpayerNumber === '00000000000') continue

    rows.push({
      taxpayerNumber,
      outletNumber,
      phone: phoneRaw.trim() || null,
      rowNum: i + (hasHeader ? 2 : 1),
    })
  }

  return { rows, format, phoneColFound: phoneColIdx >= 0 }
}
