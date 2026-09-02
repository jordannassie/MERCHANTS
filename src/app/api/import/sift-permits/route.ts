/**
 * POST /api/import/sift-permits
 *
 * Import permit phone numbers from a Texas Comptroller SIFT weekly new-permits
 * file (stpMM-DDph.zip → the extracted CSV/text inside the ZIP).
 *
 * Accepts multipart/form-data:
 *   file     — extracted CSV file from the ZIP (NOT the ZIP itself)
 *   preview  — "true" to return up to 10 proposed matches without saving
 *
 * Column layout (verified from stp08-31ph.csv, 22 cols, no header row):
 *   [0]  taxpayer_number
 *   [1]  outlet_number
 *   [15] telephone  ← permit phone
 *
 * Match key: taxpayer_number + outlet_number (normalized, never by name).
 * Outlet numbers are normalized to plain integer strings so "00001" = "1".
 * Taxpayer numbers are kept as 11-digit strings — never cast to JS Number.
 *
 * Safe rule: never overwrites a manually-entered primary_phone.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizePhone } from '@/lib/phone-normalize'
import { parseSiftFile, normalizeOutletNumber } from '@/lib/sift-parser'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB
const BATCH_SIZE = 100  // taxpayer IDs per DB query chunk

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

  const text = await file.text()
  const { rows: allRows, format, phoneColFound, skipReasons } = parseSiftFile(text)

  if (!allRows.length) {
    return NextResponse.json({
      error: 'No parseable rows found. Ensure this is the extracted CSV from stpMM-DDph.zip, not the ZIP itself.',
      format,
      skipReasons,
    }, { status: 422 })
  }

  if (!phoneColFound) {
    return NextResponse.json({
      error: 'Phone column not found. This appears to be the standard file without telephone numbers. Download the stpMM-DDph.zip (ph = phone) variant.',
      format,
      rowsParsed: allRows.length,
      skipReasons,
    }, { status: 422 })
  }

  // ── Separate rows by phone validity ────────────────────────────────────────
  let missingPhone = 0, invalidPhone = 0
  interface ValidRow { taxpayerNumber: string; outletNumber: string; normalizedPhone: string; rowNum: number }
  const validRows: ValidRow[] = []

  for (const row of allRows) {
    if (!row.phone) { missingPhone++; continue }
    const normalized = normalizePhone(row.phone)
    if (!normalized) { invalidPhone++; continue }
    validRows.push({
      taxpayerNumber: row.taxpayerNumber,
      outletNumber:   row.outletNumber,
      normalizedPhone: normalized,
      rowNum: row.rowNum,
    })
  }

  // ── Batch-query DB leads by taxpayer_number ─────────────────────────────────
  const db = createServiceClient()
  const uniqueTaxpayers = [...new Set(validRows.map(r => r.taxpayerNumber))]

  interface LeadRecord {
    id: string
    taxpayer_number: string
    outlet_number: string | null
    permit_phone: string | null
    display_name: string | null
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

  // ── Build lookup map: taxpayer_number → lead[] ──────────────────────────────
  const leadsByTaxpayer = new Map<string, LeadRecord[]>()
  for (const lead of allLeads) {
    if (!lead.taxpayer_number) continue
    const arr = leadsByTaxpayer.get(lead.taxpayer_number) ?? []
    arr.push(lead)
    leadsByTaxpayer.set(lead.taxpayer_number, arr)
  }

  // ── Match each SIFT row against DB leads ────────────────────────────────────
  let taxpayerNotFound = 0, outletNotFound = 0, alreadySaved = 0
  interface MatchedRow { lead: LeadRecord; normalizedPhone: string; rowNum: number }
  const exactMatches: MatchedRow[] = []
  const taxpayerOnlyCandidates: Array<{ taxpayerNumber: string; outletNumber: string; availableOutlets: string[] }> = []

  for (const row of validRows) {
    const leads = leadsByTaxpayer.get(row.taxpayerNumber)
    if (!leads || leads.length === 0) {
      taxpayerNotFound++
      continue
    }

    const csvOutletNorm = row.outletNumber  // already normalized by parser
    const exact = leads.find(l => normalizeOutletNumber(l.outlet_number) === csvOutletNorm)

    if (exact) {
      if (exact.permit_phone === row.normalizedPhone) {
        alreadySaved++  // idempotent: same phone already stored
      } else {
        exactMatches.push({ lead: exact, normalizedPhone: row.normalizedPhone, rowNum: row.rowNum })
      }
    } else {
      outletNotFound++
      if (taxpayerOnlyCandidates.length < 20) {
        taxpayerOnlyCandidates.push({
          taxpayerNumber: row.taxpayerNumber,
          outletNumber: row.outletNumber,
          availableOutlets: leads.map(l => normalizeOutletNumber(l.outlet_number)).filter(Boolean),
        })
      }
    }
  }

  // ── Preview mode: return first 10 proposed matches without saving ───────────
  if (isPreview) {
    const preview = exactMatches.slice(0, 10).map(m => ({
      leadId: m.lead.id,
      displayName: m.lead.display_name ?? '(unnamed)',
      taxpayerNumber: m.lead.taxpayer_number,
      outletNumber: normalizeOutletNumber(m.lead.outlet_number),
      maskedPhone: maskPhone(m.normalizedPhone),
    }))

    return NextResponse.json({
      preview,
      summary: {
        format,
        rowsParsed: allRows.length,
        rowsWithPhone: validRows.length + missingPhone + invalidPhone,
        validPhones: validRows.length,
        exactMatches: exactMatches.length,
        taxpayerOnlyCandidates: taxpayerOnlyCandidates.length,
        alreadySaved,
        skipReasons: {
          ...skipReasons,
          missingPhone,
          invalidPhone,
          taxpayerNotFound,
          outletNotFound,
        },
      },
    })
  }

  // ── Zero-match diagnostic ───────────────────────────────────────────────────
  if (exactMatches.length === 0) {
    return NextResponse.json({
      error: exactMatchDiagnostic({
        allRows, missingPhone, invalidPhone,
        taxpayerNotFound, outletNotFound, taxpayerOnlyCandidates,
      }),
      summary: {
        format,
        rowsParsed: allRows.length,
        rowsWithPhone: validRows.length + missingPhone + invalidPhone,
        validPhones: validRows.length,
        exactMatches: 0,
        alreadySaved,
        skipReasons: {
          ...skipReasons,
          missingPhone,
          invalidPhone,
          taxpayerNotFound,
          outletNotFound,
        },
      },
    }, { status: 200 })  // 200 so UI displays summary rather than throwing
  }

  // ── Save permit phones — parallel batches of 20 concurrent updates ──────────
  // Sequential updates for 400+ leads would risk hitting Netlify's 10s timeout.
  // Promise.all in chunks of 20 processes ~441 updates in ~1.2 seconds.
  const importedAt = new Date().toISOString()
  const source = 'sift_weekly'
  const CONCURRENT = 20
  const attempted = exactMatches.length
  let updated = 0, failed = 0
  const saveErrors: string[] = []

  for (let i = 0; i < exactMatches.length; i += CONCURRENT) {
    const chunk = exactMatches.slice(i, i + CONCURRENT)
    const results = await Promise.all(
      chunk.map(async ({ lead, normalizedPhone, rowNum }) => {
        const { error } = await db
          .from('leads')
          .update({
            permit_phone: normalizedPhone,
            permit_phone_source: source,
            permit_phone_imported_at: importedAt,
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
    summary: {
      format,
      phoneColFound,
      rowsParsed: allRows.length,
      rowsWithPhone: validRows.length + missingPhone + invalidPhone,
      validPhones: validRows.length,
      exactMatches: exactMatches.length,
      attempted,
      phonesAdded: updated,
      alreadySaved,
      failed,
      errors: saveErrors,
      skipReasons: {
        ...skipReasons,
        missingPhone,
        invalidPhone,
        taxpayerNotFound,
        outletNotFound,
      },
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mask a normalized phone for safe display: +12145551234 → •••-•••-1234 */
function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (digits.length >= 10) {
    return `•••-•••-${digits.slice(-4)}`
  }
  return '•••-••••'
}

/** Build a human-readable zero-match diagnostic */
function exactMatchDiagnostic({
  allRows, missingPhone, invalidPhone,
  taxpayerNotFound, outletNotFound, taxpayerOnlyCandidates,
}: {
  allRows: { length: number }
  missingPhone: number
  invalidPhone: number
  taxpayerNotFound: number
  outletNotFound: number
  taxpayerOnlyCandidates: Array<{ taxpayerNumber: string; outletNumber: string; availableOutlets: string[] }>
}): string {
  const parts: string[] = [
    `Parsed ${allRows.length} rows — 0 exact matches found.`,
  ]

  if (missingPhone > 0)       parts.push(`${missingPhone} rows had no phone number.`)
  if (invalidPhone > 0)       parts.push(`${invalidPhone} rows had an invalid phone.`)
  if (taxpayerNotFound > 0)   parts.push(`${taxpayerNotFound} rows had a taxpayer number not in your leads.`)
  if (outletNotFound > 0) {
    parts.push(`${outletNotFound} rows found a matching taxpayer but outlet number did not match.`)
    if (taxpayerOnlyCandidates.length > 0) {
      const sample = taxpayerOnlyCandidates[0]
      parts.push(
        `Example: taxpayer ${sample.taxpayerNumber}, SIFT outlet "${sample.outletNumber}", ` +
        `DB has outlets [${sample.availableOutlets.join(', ')}].`
      )
    }
  }

  parts.push('This file covers all of Texas — leads outside your DFW territory will not match.')
  return parts.join(' ')
}
