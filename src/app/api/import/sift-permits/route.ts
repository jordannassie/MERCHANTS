/**
 * POST /api/import/sift-permits
 *
 * Import permit phone numbers from a Texas Comptroller SIFT weekly new-permits
 * file (stpMM-DDph.zip → the extracted CSV/text inside the ZIP).
 *
 * Accepts multipart/form-data:
 *   file     — CSV/text file from inside the ZIP (or the ZIP itself)
 *   preview  — "true" to return match preview without saving
 *
 * Phone strategy (fallback):
 *   1. col-15 (telephone / outlet location phone)
 *   2. col-8  (taxpayer_phone) when col-15 is blank or a stub
 *
 * Outlet-number matching:
 *   - "00001" → "1", "00000" → "0" (USE TAX — valid lead, NOT skipped)
 *   - Truly blank outlet rows (~1 row) → counted separately, not discarded silently
 *
 * Expected from stp08-31ph.csv (4,589 total rows):
 *   Valid taxpayer phones:  ~4,537
 *   Valid outlet phones:    ~2,573
 *   Rows with any phone:    ~4,561
 *   No valid phone at all:  ~28
 */

import { NextRequest, NextResponse } from 'next/server'
import { unzipSync } from 'fflate'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizePhone } from '@/lib/phone-normalize'
import { parseSiftFile, normalizeOutletNumber } from '@/lib/sift-parser'

const MAX_FILE_BYTES = 50 * 1024 * 1024  // 50 MB
const BATCH_SIZE     = 100               // taxpayer IDs per DB query chunk
const CONCURRENT     = 20               // parallel DB updates when saving

// ── POST handler ──────────────────────────────────────────────────────────────

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

  const isPreview = formData.get('preview') === 'true'

  // ── Unzip or read raw text ─────────────────────────────────────────────────
  let text: string
  const fileName = (file as File).name ?? ''
  const isZip =
    fileName.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'

  if (isZip) {
    try {
      const bytes    = new Uint8Array(await file.arrayBuffer())
      const unzipped = unzipSync(bytes)
      const entries  = Object.entries(unzipped)
      if (!entries.length) {
        return NextResponse.json({ error: 'ZIP file is empty' }, { status: 422 })
      }
      const dataEntry = entries.find(([name]) =>
        !name.toLowerCase().endsWith('.pdf') &&
        !name.toLowerCase().includes('readme') &&
        !name.toLowerCase().includes('layout') &&
        name.trim() !== ''
      ) ?? entries[0]
      text = new TextDecoder('utf-8').decode(dataEntry[1])
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `Failed to unzip file: ${msg}` }, { status: 422 })
    }
  } else {
    text = await file.text()
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  const { rows: allRows, format, phoneColFound, skipReasons } = parseSiftFile(text)

  if (!allRows.length) {
    return NextResponse.json({
      error: 'No parseable rows found. Ensure this is the extracted CSV from stpMM-DDph.zip.',
      format,
      skipReasons,
    }, { status: 422 })
  }

  if (!phoneColFound) {
    return NextResponse.json({
      error: 'Phone column not found. Download the stpMM-DDph.zip (ph = phone) variant.',
      format,
      rowsParsed: allRows.length,
      skipReasons,
    }, { status: 422 })
  }

  // ── Phone validation with fallback ─────────────────────────────────────────
  // For each row: try outlet phone (col 15) first, then taxpayer phone (col 8).
  // Track granular counts matching the file inspection report.

  let validOutletPhones   = 0   // rows where col-15 alone is valid
  let validTaxpayerPhones = 0   // rows where col-8 alone is valid (col-15 was not)
  let noValidPhone        = 0   // rows with no valid phone in either column

  interface ValidRow {
    taxpayerNumber:  string
    outletNumber:    string
    outletNumberRaw: string
    permitType:      string
    normalizedPhone: string
    phoneSource:     'outlet' | 'taxpayer'   // which column the phone came from
    rowNum:          number
  }
  const validRows: ValidRow[] = []

  // Separate counts for the summary (independent of each other)
  let totalValidOutletCol   = 0  // col-15 valid count regardless of col-8
  let totalValidTaxpayerCol = 0  // col-8 valid count regardless of col-15

  for (const row of allRows) {
    const outletNorm   = normalizePhone(row.outletPhone)
    const taxpayerNorm = normalizePhone(row.taxpayerPhone)

    if (outletNorm)   totalValidOutletCol++
    if (taxpayerNorm) totalValidTaxpayerCol++

    if (outletNorm) {
      validOutletPhones++
      validRows.push({
        taxpayerNumber:  row.taxpayerNumber,
        outletNumber:    row.outletNumber,
        outletNumberRaw: row.outletNumberRaw,
        permitType:      row.permitType,
        normalizedPhone: outletNorm,
        phoneSource:     'outlet',
        rowNum:          row.rowNum,
      })
    } else if (taxpayerNorm) {
      validTaxpayerPhones++
      validRows.push({
        taxpayerNumber:  row.taxpayerNumber,
        outletNumber:    row.outletNumber,
        outletNumberRaw: row.outletNumberRaw,
        permitType:      row.permitType,
        normalizedPhone: taxpayerNorm,
        phoneSource:     'taxpayer',
        rowNum:          row.rowNum,
      })
    } else {
      noValidPhone++
    }
  }

  const anyValidPhone = validOutletPhones + validTaxpayerPhones

  // ── Batch-query DB leads by taxpayer_number ────────────────────────────────
  const db = createServiceClient()
  const uniqueTaxpayers = [...new Set(validRows.map(r => r.taxpayerNumber))]

  interface LeadRecord {
    id:              string
    taxpayer_number: string
    outlet_number:   string | null
    permit_phone:    string | null
    display_name:    string | null
  }
  const allLeads: LeadRecord[] = []

  for (let i = 0; i < uniqueTaxpayers.length; i += BATCH_SIZE) {
    const chunk = uniqueTaxpayers.slice(i, i + BATCH_SIZE)
    const { data, error } = await db
      .from('leads')
      .select('id, taxpayer_number, outlet_number, permit_phone, display_name')
      .in('taxpayer_number', chunk)
    if (error) {
      console.error('[sift-permits] batch query error:', error.message)
      continue
    }
    if (data) allLeads.push(...(data as LeadRecord[]))
  }

  // ── Build lookup map: taxpayer_number → lead[] ─────────────────────────────
  const leadsByTaxpayer = new Map<string, LeadRecord[]>()
  for (const lead of allLeads) {
    if (!lead.taxpayer_number) continue
    const arr = leadsByTaxpayer.get(lead.taxpayer_number) ?? []
    arr.push(lead)
    leadsByTaxpayer.set(lead.taxpayer_number, arr)
  }

  // ── Match each valid SIFT row against DB leads ─────────────────────────────
  let taxpayerNotFound   = 0
  let outletMismatch     = 0
  let nonOutletRecord    = 0  // 00000 outlet (USE TAX) with no matching DB lead
  let alreadySaved       = 0

  interface MatchedRow { lead: LeadRecord; normalizedPhone: string; rowNum: number; phoneSource: 'outlet' | 'taxpayer' }
  const exactMatches: MatchedRow[] = []

  // Diagnostics for mismatch inspection
  const mismatchSamples: Array<{ taxpayerNumber: string; siftOutlet: string; dbOutlets: string[] }> = []

  for (const row of validRows) {
    const leads = leadsByTaxpayer.get(row.taxpayerNumber)
    if (!leads || leads.length === 0) {
      taxpayerNotFound++
      continue
    }

    const csvOutletNorm = row.outletNumber  // "0"=USE TAX, "1","2",... for SALES TAX

    // Match: normalizeOutletNumber on DB lead must equal csvOutletNorm.
    // "00000" in DB → normalizeOutletNumber → "0" === csvOutletNorm "0" for USE TAX rows.
    const exact = leads.find(l => normalizeOutletNumber(l.outlet_number) === csvOutletNorm)

    if (exact) {
      if (exact.permit_phone === row.normalizedPhone) {
        alreadySaved++   // idempotent: same phone already stored
      } else {
        exactMatches.push({
          lead:            exact,
          normalizedPhone: row.normalizedPhone,
          rowNum:          row.rowNum,
          phoneSource:     row.phoneSource,
        })
      }
    } else {
      // No outlet match
      if (csvOutletNorm === '0') {
        // USE TAX / 00000 outlet — no matching DB lead found
        nonOutletRecord++
      } else {
        outletMismatch++
        if (mismatchSamples.length < 20) {
          mismatchSamples.push({
            taxpayerNumber: row.taxpayerNumber,
            siftOutlet:     row.outletNumberRaw,
            dbOutlets:      leads.map(l => l.outlet_number ?? '').filter(Boolean).slice(0, 5),
          })
        }
      }
    }
  }

  // ── Build phone column stats (independent counts) ──────────────────────────
  const phoneSummary = {
    totalRows:             allRows.length,
    validOutletPhones:     totalValidOutletCol,    // col-15 valid
    validTaxpayerPhones:   totalValidTaxpayerCol,  // col-8 valid (independent)
    rowsWithAnyPhone:      anyValidPhone,           // used outlet || taxpayer fallback
    rowsWithNoPhone:       noValidPhone,
    usedOutletPhone:       validOutletPhones,       // best_phone came from col-15
    usedTaxpayerFallback:  validTaxpayerPhones,     // best_phone came from col-8
  }

  // ── Preview mode: return stats + first 10 matches ──────────────────────────
  if (isPreview) {
    const preview = exactMatches.slice(0, 10).map(m => ({
      leadId:         m.lead.id,
      displayName:    m.lead.display_name ?? '(unnamed)',
      taxpayerNumber: m.lead.taxpayer_number,
      outletNumber:   normalizeOutletNumber(m.lead.outlet_number),
      maskedPhone:    maskPhone(m.normalizedPhone),
      phoneSource:    m.phoneSource,
    }))

    return NextResponse.json({
      preview,
      phoneSummary,
      summary: {
        format,
        rowsParsed:      allRows.length,
        exactMatches:    exactMatches.length,
        alreadySaved,
        skipReasons: {
          ...skipReasons,
          noValidPhone,
          taxpayerNotFound,
          outletMismatch,
          nonOutletRecord,
        },
      },
    })
  }

  // ── Zero-match diagnostic ──────────────────────────────────────────────────
  if (exactMatches.length === 0) {
    return NextResponse.json({
      error: buildZeroMatchDiagnostic({
        allRows, phoneSummary,
        taxpayerNotFound, outletMismatch, nonOutletRecord,
        mismatchSamples,
      }),
      phoneSummary,
      summary: {
        format,
        rowsParsed:   allRows.length,
        exactMatches: 0,
        alreadySaved,
        skipReasons: {
          ...skipReasons,
          noValidPhone,
          taxpayerNotFound,
          outletMismatch,
          nonOutletRecord,
        },
      },
    }, { status: 200 })
  }

  // ── Save permit phones — parallel batches ──────────────────────────────────
  const importedAt = new Date().toISOString()
  const source     = 'sift_weekly'
  const attempted  = exactMatches.length
  let updated = 0, failed = 0
  const saveErrors: string[] = []

  for (let i = 0; i < exactMatches.length; i += CONCURRENT) {
    const chunk = exactMatches.slice(i, i + CONCURRENT)
    const results = await Promise.all(
      chunk.map(async ({ lead, normalizedPhone, rowNum }) => {
        const { error } = await db
          .from('leads')
          .update({
            permit_phone:              normalizedPhone,
            permit_phone_source:       source,
            permit_phone_imported_at:  importedAt,
          })
          .eq('id', lead.id)
        return { ok: !error, msg: error ? `Row ${rowNum}: ${error.message}` : null }
      })
    )
    for (const r of results) {
      if (r.ok) updated++
      else { failed++; if (saveErrors.length < 10) saveErrors.push(r.msg!) }
    }
  }

  return NextResponse.json({
    phoneSummary,
    summary: {
      format,
      phoneColFound,
      rowsParsed:    allRows.length,
      exactMatches:  exactMatches.length,
      attempted,
      phonesAdded:   updated,
      alreadySaved,
      failed,
      errors:        saveErrors,
      skipReasons: {
        ...skipReasons,
        noValidPhone,
        taxpayerNotFound,
        outletMismatch,
        nonOutletRecord,
      },
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mask a normalized phone for safe display: +12145551234 → •••-•••-1234 */
function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  return digits.length >= 10 ? `•••-•••-${digits.slice(-4)}` : '•••-••••'
}

/** Build a human-readable zero-match diagnostic */
function buildZeroMatchDiagnostic({
  allRows,
  phoneSummary,
  taxpayerNotFound,
  outletMismatch,
  nonOutletRecord,
  mismatchSamples,
}: {
  allRows:         { length: number }
  phoneSummary:    { rowsWithAnyPhone: number; rowsWithNoPhone: number; validOutletPhones: number; validTaxpayerPhones: number }
  taxpayerNotFound: number
  outletMismatch:   number
  nonOutletRecord:  number
  mismatchSamples: Array<{ taxpayerNumber: string; siftOutlet: string; dbOutlets: string[] }>
}): string {
  const parts: string[] = [
    `Parsed ${allRows.length} rows — 0 exact matches found.`,
    `Phone coverage: ${phoneSummary.rowsWithAnyPhone} rows have a valid phone ` +
    `(${phoneSummary.validOutletPhones} outlet + ${phoneSummary.validTaxpayerPhones} taxpayer fallback); ` +
    `${phoneSummary.rowsWithNoPhone} have no valid phone.`,
  ]

  if (taxpayerNotFound > 0) {
    parts.push(
      `${taxpayerNotFound} rows had a taxpayer number not found in your leads database. ` +
      `Run "Import Texas Leads" to backfill the full statewide permit set, then re-upload this SIFT file.`
    )
  }
  if (outletMismatch > 0) {
    parts.push(`${outletMismatch} rows found a matching taxpayer but outlet number did not match any DB lead.`)
    if (mismatchSamples.length > 0) {
      const s = mismatchSamples[0]
      parts.push(
        `Example: taxpayer ${s.taxpayerNumber}, SIFT outlet "${s.siftOutlet}", ` +
        `DB has [${s.dbOutlets.join(', ')}].`
      )
    }
  }
  if (nonOutletRecord > 0) {
    parts.push(
      `${nonOutletRecord} USE TAX rows (outlet=00000) had no matching DB lead — ` +
      `these may not have been imported yet (run statewide backfill).`
    )
  }
  return parts.join(' ')
}
