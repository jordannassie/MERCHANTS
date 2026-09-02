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
import { parseSiftFile } from '@/lib/sift-parser'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

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
  const { rows, format, phoneColFound } = parseSiftFile(text)

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
