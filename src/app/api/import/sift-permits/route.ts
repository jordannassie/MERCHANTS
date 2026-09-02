/**
 * POST /api/import/sift-permits
 *
 * Import permit phone numbers from a Texas Comptroller SIFT weekly new-permits
 * file (stpMM-DDph.zip → the extracted text/CSV inside the ZIP).
 *
 * The weekly "ph" file includes telephone as an extra column beyond the 19
 * columns available in the public Socrata dataset. The exact field layout is
 * documented inside the ZIP's record-layout PDF.
 *
 * This endpoint accepts multipart/form-data with:
 *   - file: the extracted text/CSV file from the ZIP (NOT the ZIP itself)
 *
 * How to get the file:
 *   1. Register a free SIFT account at https://data-secure.comptroller.texas.gov/
 *   2. Download the latest stpMM-DDph.zip
 *   3. Unzip and upload the text file here.
 *
 * Match key: taxpayer_number + outlet_number (never name or address alone)
 * Safe rule: never overwrites a manually entered primary_phone.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizePhone } from '@/lib/phone-normalize'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

// Known phone column header variants the TX Comptroller file might use
const PHONE_COLUMN_CANDIDATES = [
  'telephone', 'phone', 'phone_number', 'taxpayer_phone',
  'outlet_phone', 'contact_phone', 'tel', 'phone_no',
]

// The 19-column Socrata field order (used when file has no header row)
// Phone is expected as column 20 (index 19) in the ph-variant.
const FIXED_COLUMN_ORDER = [
  'taxpayer_number', 'taxpayer_name', 'taxpayer_address', 'taxpayer_city',
  'taxpayer_state', 'taxpayer_zip_code', 'taxpayer_county_code',
  'taxpayer_organization_type', 'outlet_number', 'outlet_name',
  'outlet_address', 'outlet_city', 'outlet_state', 'outlet_zip_code',
  'outlet_county_code', 'outlet_naics_code',
  'outlet_inside_outside_city_limits_indicator',
  'outlet_permit_issue_date', 'outlet_first_sales_date',
  'telephone', // column 20 — present only in the ph (with-phone) file
]

interface ParseResult {
  taxpayerNumber: string
  outletNumber: string
  phone: string | null
  rowNum: number
}

/**
 * Parse a single text line. Tries:
 *   1. Tab-delimited
 *   2. Comma-delimited (RFC 4180 — no quotes around unquoted fields)
 *   3. Pipe-delimited
 * Returns the fields array.
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

function parseFile(text: string): { rows: ParseResult[]; format: string; phoneColFound: boolean } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { rows: [], format: 'empty', phoneColFound: false }

  const firstFields = splitLine(lines[0])
  let hasHeader = false
  let phoneColIdx = -1
  let taxpayerColIdx = 0
  let outletColIdx = 8
  let format = 'positional'

  // Detect header row
  const lowerFirst = firstFields.map(f => f.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
  if (lowerFirst.includes('taxpayer_number') || lowerFirst.includes('taxpayer_id') || lowerFirst.includes('taxpayernumber')) {
    hasHeader = true
    taxpayerColIdx = lowerFirst.findIndex(f => f.includes('taxpayer_number') || f.includes('taxpayer_id'))
    outletColIdx   = lowerFirst.findIndex(f => f.includes('outlet_number') || f.includes('location_number'))
    phoneColIdx    = lowerFirst.findIndex(f => PHONE_COLUMN_CANDIDATES.some(p => f.includes(p)))
    format = 'header'
  } else {
    // No header: use fixed column order
    taxpayerColIdx = FIXED_COLUMN_ORDER.indexOf('taxpayer_number')
    outletColIdx   = FIXED_COLUMN_ORDER.indexOf('outlet_number')
    phoneColIdx    = FIXED_COLUMN_ORDER.indexOf('telephone')
    format = 'positional'
  }

  const dataLines = hasHeader ? lines.slice(1) : lines
  const rows: ParseResult[] = []

  for (let i = 0; i < dataLines.length; i++) {
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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
  }

  const text = await file.text()
  const { rows, format, phoneColFound } = parseFile(text)

  if (!rows.length) {
    return NextResponse.json({
      error: 'No parseable rows found. Check that the file is the extracted text file from stpMM-DDph.zip (not the ZIP itself).',
      format,
    }, { status: 422 })
  }

  if (!phoneColFound) {
    return NextResponse.json({
      error: 'Phone column not found in this file. This file appears to be the standard (non-ph) variant without telephone numbers. Download the stpMM-DDph.zip file which includes a telephone column.',
      format,
      rowsParsed: rows.length,
    }, { status: 422 })
  }

  const db = createServiceClient()
  const importedAt = new Date().toISOString()
  const source = 'sift_weekly'

  let matched = 0, updated = 0, skipped = 0, noPhone = 0
  const errors: string[] = []

  for (const row of rows) {
    if (!row.phone) { noPhone++; continue }

    const normalizedPhone = normalizePhone(row.phone)
    if (!normalizedPhone) { skipped++; continue }

    // Find existing lead by exact taxpayer_number + outlet_number
    const { data: lead, error: findErr } = await db
      .from('leads')
      .select('id, permit_phone, primary_phone')
      .eq('taxpayer_number', row.taxpayerNumber)
      .eq('outlet_number', row.outletNumber)
      .maybeSingle()

    if (findErr) {
      errors.push(`Row ${row.rowNum}: DB error — ${findErr.message}`)
      continue
    }
    if (!lead) continue // Not a lead we're tracking

    matched++

    // Never overwrite a manually entered primary_phone
    // Only update permit_phone — it's stored separately
    const { error: upErr } = await db
      .from('leads')
      .update({
        permit_phone: normalizedPhone,
        permit_phone_source: source,
        permit_phone_imported_at: importedAt,
      })
      .eq('id', lead.id)
      // Don't overwrite if already has a permit phone from a newer source
      // (allow re-import to update)

    if (upErr) {
      errors.push(`Row ${row.rowNum}: update error — ${upErr.message}`)
      skipped++
    } else {
      updated++
    }
  }

  return NextResponse.json({
    summary: {
      format,
      phoneColFound,
      rowsParsed: rows.length,
      noPhone,
      matched,
      updated,
      skipped,
      errorCount: errors.length,
    },
    errors: errors.slice(0, 20),
    instructions: phoneColFound
      ? null
      : 'Phone column not found — ensure you are using the stpMM-DDph.zip file (with telephone) not the standard file.',
  })
}
