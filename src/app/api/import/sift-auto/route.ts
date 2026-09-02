/**
 * POST /api/import/sift-auto
 *
 * Automatically downloads and imports the latest Texas Comptroller weekly
 * permit-phone file (stpMM-DDph.zip) directly from the SIFT API.
 *
 * Requires:
 *   CPA_SIFT_API_KEY — env var (never NEXT_PUBLIC_); register a free account
 *   at https://data-secure.comptroller.texas.gov/main/view and select
 *   "SIFT" when creating the key.
 *
 * Workflow:
 *   1. List SIFT files
 *   2. Find the latest stpMM-DDph.zip
 *   3. Check sift_import_log — skip if already imported (unless force=true)
 *   4. Get signed download URL
 *   5. Download and unzip the ZIP in memory
 *   6. Parse with shared sift-parser
 *   7. Match leads by taxpayer_number + outlet_number
 *   8. Save permit_phone (never overwrites manually entered phones)
 *   9. Write to sift_import_log
 *
 * Body: { force?: boolean }   — force=true re-imports even if already cached
 *
 * GET /api/import/sift-auto   — returns last import status and SIFT key state
 */

import { NextRequest, NextResponse } from 'next/server'
import { unzipSync } from 'fflate'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizePhone } from '@/lib/phone-normalize'
import { parseSiftFile, normalizeOutletNumber } from '@/lib/sift-parser'
import {
  siftListFiles,
  findLatestPermitPhoneFile,
  hasSTPAccess,
  siftGetDownloadUrl,
  downloadFile,
} from '@/lib/sift-api'

const BATCH_SIZE = 100  // taxpayer IDs per DB query chunk

const SIFT_KEY_REGISTRATION_URL = 'https://data-secure.comptroller.texas.gov/main/view'

// ── GET: return current status (last import, key configured, STP access) ──────
export async function GET(): Promise<NextResponse> {
  const hasKey = !!process.env.CPA_SIFT_API_KEY

  if (!hasKey) {
    return NextResponse.json({
      siftKeyConfigured: false,
      stpAccessible: false,
      siftKeyRegistrationUrl: SIFT_KEY_REGISTRATION_URL,
      lastImport: null,
    })
  }

  // Quick probe: can we see any STP files?
  let stpAccessible = false
  let availableFile: string | null = null
  try {
    const files = await siftListFiles()
    stpAccessible = hasSTPAccess(files)
    const latest = findLatestPermitPhoneFile(files)
    availableFile = latest ? (latest.filePath.split('/').pop() ?? null) : null
  } catch { /* key may be invalid; treat as not accessible */ }

  const db = createServiceClient()
  const { data: lastImport } = await (async () => {
    try {
      return await db
        .from('sift_import_log')
        .select('filename, status, records_parsed, leads_matched, phones_added, imported_at, error_message')
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    } catch { return { data: null } }
  })()

  return NextResponse.json({
    siftKeyConfigured: true,
    stpAccessible,
    availableFile,
    lastImport: lastImport ?? null,
  })
}

// ── POST: run the import ──────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Key check ────────────────────────────────────────────────────────────
  if (!process.env.CPA_SIFT_API_KEY) {
    return NextResponse.json(
      {
        errorCode: 'sift_key_missing',
        error: 'CPA_SIFT_API_KEY is not configured.',
        instructions: [
          `Register a free account at ${SIFT_KEY_REGISTRATION_URL}`,
          'Select "SIFT" when creating the API key.',
          'Add CPA_SIFT_API_KEY to your Netlify site environment variables (never use NEXT_PUBLIC_).',
          'Redeploy after adding the key.',
        ],
        siftKeyRegistrationUrl: SIFT_KEY_REGISTRATION_URL,
      },
      { status: 503 }
    )
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let force = false
  try {
    const body = await req.json().catch(() => ({}))
    force = body?.force === true
  } catch { /* force stays false */ }

  const db = createServiceClient()

  // ── 3. List SIFT files ───────────────────────────────────────────────────────
  let files
  try {
    files = await siftListFiles()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ errorCode: 'sift_api_error', error: msg }, { status: 502 })
  }

  const latest = findLatestPermitPhoneFile(files)
  if (!latest) {
    const stpAccess = hasSTPAccess(files)
    return NextResponse.json(
      {
        errorCode: stpAccess ? 'no_phone_file' : 'stp_access_missing',
        error: stpAccess
          ? 'No stpMM-DDph.zip file found. The weekly file may not yet be published.'
          : 'Your CPA_SIFT_API_KEY does not have STP (new permit) section access — only GISSS files are visible. Log in to the SIFT portal and request access to the Sales Tax Permit weekly file section.',
        instructions: stpAccess ? undefined : [
          'Log in at https://data-secure.comptroller.texas.gov/main/view',
          'Request access to the weekly Sales Tax Permit (STP) data section.',
          'Once approved, create a new API key under that section.',
          'Set that key as CPA_SIFT_API_KEY in Netlify (different from the GISSS key).',
        ],
        siftKeyRegistrationUrl: SIFT_KEY_REGISTRATION_URL,
        sectionsVisible: stpAccess ? undefined : ['gisss (geographic data only)'],
      },
      { status: 403 }
    )
  }

  const filename = latest.filePath.split('/').pop() ?? latest.filePath

  // ── 4. Cache check: already imported? ───────────────────────────────────────
  if (!force) {
    const { data: existing } = await (async () => {
      try {
        return await db
          .from('sift_import_log')
          .select('id, imported_at, phones_added, leads_matched')
          .eq('filename', filename)
          .eq('status', 'completed')
          .maybeSingle()
      } catch { return { data: null } }
    })()

    if (existing) {
      return NextResponse.json({
        cached: true,
        filename,
        message: `${filename} was already imported on ${new Date(existing.imported_at).toLocaleString()}.`,
        lastImport: existing,
      })
    }
  }

  // ── 5. Get signed download URL ───────────────────────────────────────────────
  let downloadUrl: string
  try {
    downloadUrl = await siftGetDownloadUrl(latest.filePath)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ errorCode: 'sift_api_error', error: `get-link: ${msg}` }, { status: 502 })
  }

  // ── 6. Download and unzip ────────────────────────────────────────────────────
  let fileBytes: Uint8Array
  try {
    fileBytes = await downloadFile(downloadUrl)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ errorCode: 'download_error', error: `Download failed: ${msg}` }, { status: 502 })
  }

  let fileText: string
  try {
    // Unzip synchronously in memory — the ZIP contains one text/CSV file
    const unzipped = unzipSync(fileBytes)
    const entries = Object.entries(unzipped)

    if (!entries.length) {
      return NextResponse.json({ errorCode: 'zip_error', error: 'ZIP file is empty' }, { status: 422 })
    }

    // Find the data file — skip PDF/readme entries
    const dataEntry = entries.find(([name]) =>
      !name.toLowerCase().endsWith('.pdf') &&
      !name.toLowerCase().includes('readme') &&
      !name.toLowerCase().includes('layout') &&
      name.trim() !== ''
    ) ?? entries[0]

    fileText = new TextDecoder('utf-8').decode(dataEntry[1])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ errorCode: 'zip_error', error: `Unzip failed: ${msg}` }, { status: 422 })
  }

  // ── 7. Parse ─────────────────────────────────────────────────────────────────
  const { rows, format, phoneColFound } = parseSiftFile(fileText)

  if (!rows.length) {
    return NextResponse.json({
      errorCode: 'parse_error',
      error: `No parseable rows found in ${filename} (format: ${format}).`,
    }, { status: 422 })
  }

  if (!phoneColFound) {
    return NextResponse.json({
      errorCode: 'no_phone_column',
      error: `Phone column not found in ${filename}. This may be the standard file without telephone numbers — download the stpMM-DDph.zip (ph = phone) variant.`,
      rowsParsed: rows.length,
    }, { status: 422 })
  }

  // ── 8. Prepare rows and batch-fetch matching leads ───────────────────────────
  const importedAt = new Date().toISOString()
  const source = `sift_auto:${filename}`

  // Build list of rows that have valid phones
  interface ValidSiftRow { taxpayerNumber: string; outletNumber: string; normalizedPhone: string; rowNum: number }
  let noPhone = 0, skipped = 0
  const validRows: ValidSiftRow[] = []
  for (const row of rows) {
    if (!row.phone) { noPhone++; continue }
    const normalized = normalizePhone(row.phone)
    if (!normalized) { skipped++; continue }
    validRows.push({ taxpayerNumber: row.taxpayerNumber, outletNumber: row.outletNumber, normalizedPhone: normalized, rowNum: row.rowNum })
  }

  // Batch-query DB leads by taxpayer_number chunks
  interface LeadRecord { id: string; taxpayer_number: string; outlet_number: string | null; permit_phone: string | null }
  const uniqueTaxpayers = [...new Set(validRows.map(r => r.taxpayerNumber))]
  const allLeads: LeadRecord[] = []

  for (let i = 0; i < uniqueTaxpayers.length; i += BATCH_SIZE) {
    const chunk = uniqueTaxpayers.slice(i, i + BATCH_SIZE)
    const { data } = await db
      .from('leads')
      .select('id, taxpayer_number, outlet_number, permit_phone')
      .in('taxpayer_number', chunk)
    if (data) allLeads.push(...(data as LeadRecord[]))
  }

  // Index leads by taxpayer_number
  const leadsByTaxpayer = new Map<string, LeadRecord[]>()
  for (const lead of allLeads) {
    if (!lead.taxpayer_number) continue
    const arr = leadsByTaxpayer.get(lead.taxpayer_number) ?? []
    arr.push(lead)
    leadsByTaxpayer.set(lead.taxpayer_number, arr)
  }

  // Match and save
  let matched = 0, updated = 0
  const rowErrors: string[] = []

  for (const row of validRows) {
    const leads = leadsByTaxpayer.get(row.taxpayerNumber)
    if (!leads?.length) continue

    const exact = leads.find(l => normalizeOutletNumber(l.outlet_number) === row.outletNumber)
    if (!exact) continue

    matched++
    if (exact.permit_phone === row.normalizedPhone) continue  // idempotent

    const { error: upErr } = await db
      .from('leads')
      .update({
        permit_phone: row.normalizedPhone,
        permit_phone_source: source,
        permit_phone_imported_at: importedAt,
      })
      .eq('id', exact.id)

    if (upErr) {
      rowErrors.push(`Row ${row.rowNum}: ${upErr.message}`)
      skipped++
    } else {
      updated++
    }
  }

  // ── 9. Write to sift_import_log ──────────────────────────────────────────────
  const logEntry = {
    filename,
    file_path: latest.filePath,
    status: 'completed',
    records_parsed: rows.length,
    leads_matched: matched,
    phones_added: updated,
    phones_skipped: skipped + noPhone,
    error_message: rowErrors.length ? rowErrors.slice(0, 5).join('; ') : null,
    imported_at: importedAt,
  }

  try {
    await db
      .from('sift_import_log')
      .upsert(logEntry, { onConflict: 'filename' })
  } catch (e) { console.error('[sift-auto] log write failed:', e) }

  return NextResponse.json({
    filename,
    format,
    summary: {
      rowsParsed: rows.length,
      leadsMatched: matched,
      phonesAdded: updated,
      phonesSkipped: skipped,
      noPhone,
      errorCount: rowErrors.length,
    },
    errors: rowErrors.slice(0, 10),
  })
}
