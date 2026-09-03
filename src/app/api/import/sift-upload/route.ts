/**
 * POST /api/import/sift-upload
 *
 * Unified SIFT file-upload endpoint that handles the FULL end-to-end workflow
 * without requiring a separate statewide import first:
 *
 *   Phase 1  parse      multipart/form-data { file }
 *     Parses the SIFT file, validates phones (outlet || taxpayer fallback),
 *     runs an initial match against existing DB leads, and returns:
 *       - parsedRows   compact [{taxpayerNumber, outletNumber, phone, phoneSource}]
 *         (held by the client for phase 3)
 *       - missing      [{taxpayerNumber, outletNumber}] — not yet in DB
 *       - initialMatches / alreadySaved counts
 *
 *   Phase 2  backfill   application/json { action:'backfill', missing:[...] }
 *     Fetches canonical permit records from the Texas Socrata API for specific
 *     (taxpayer, outlet) pairs.  No date filter — backfills ANY era permit.
 *     Creates missing leads via batch upsert.  CRM fields (status, starred,
 *     primary_phone…) are NOT in the payload and are therefore preserved.
 *     Client auto-loops this phase until all missing pairs are resolved.
 *
 *   Phase 3  match      application/json { action:'match', rows:[...], filename }
 *     Matches all valid-phone rows against the now-expanded DB leads, saves
 *     permit_phone (never overwrites primary_phone), logs to sift_import_log.
 *
 * Design constraints:
 *   - Each invocation targets ≤ 18 s (Netlify function budget: 26 s − 8 s head)
 *   - All DB writes use batch upsert — no N+1 UPDATE queries
 *   - CRM-protected fields are never overwritten
 *   - Re-uploading the same SIFT file is fully idempotent
 */

import { NextRequest, NextResponse } from 'next/server'
import { unzipSync } from 'fflate'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizePhone } from '@/lib/phone-normalize'
import { parseSiftFile, normalizeOutletNumber } from '@/lib/sift-parser'
import { ensureWorkspaceTerritory } from '@/lib/workspace'
import { scoreLead } from '@/lib/scoring'
import { normalize, parseDate } from '@/lib/importer-utils'

// ── Constants ────────────────────────────────────────────────────────────────

const TEXAS_API      = 'https://data.texas.gov/resource/jrea-zgmq.json'
const BUDGET_MS      = 18_000   // max wall-clock per invocation
const DB_BATCH       = 500      // rows per Supabase upsert call
const SOCRATA_BATCH  = 100      // taxpayer_numbers per Socrata IN query
const MAX_CONCURRENT = 50       // parallel UPDATE calls during match phase
const MAX_FILE_BYTES = 50 * 1024 * 1024

const TEXAS_FIELDS = [
  'taxpayer_number', 'taxpayer_name', 'taxpayer_address', 'taxpayer_city',
  'taxpayer_state', 'taxpayer_zip_code', 'taxpayer_county_code',
  'taxpayer_organization_type', 'outlet_number', 'outlet_name',
  'outlet_address', 'outlet_city', 'outlet_state', 'outlet_zip_code',
  'outlet_county_code', 'outlet_naics_code',
  'outlet_inside_outside_city_limits_indicator',
  'outlet_permit_issue_date', 'outlet_first_sales_date',
].join(',')

// ── Shared row types (passed between phases via the client) ──────────────────

/** Compact row held by the client between parse and match. */
export interface CompactSiftRow {
  taxpayerNumber: string
  outletNumber:   string
  phone:          string              // normalized E.164
  phoneSource:    'outlet' | 'taxpayer'
}

/** A (taxpayer, outlet) pair not yet present in DB. */
export interface MissingPair {
  taxpayerNumber: string
  outletNumber:   string
}

// ── Router ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    return handleParse(req)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as string
  if (action === 'backfill') return handleBackfill(body)
  if (action === 'match')    return handleMatch(body)
  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

// ── Phase 1: Parse ───────────────────────────────────────────────────────────

async function handleParse(req: NextRequest): Promise<NextResponse> {
  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 413 })
  }

  const fileName = (file as File).name ?? ''

  // ── Unzip or read raw ──────────────────────────────────────────────────────
  let text: string
  const isZip = fileName.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'

  if (isZip) {
    try {
      const bytes    = new Uint8Array(await file.arrayBuffer())
      const unzipped = unzipSync(bytes)
      const entries  = Object.entries(unzipped)
      if (!entries.length) return NextResponse.json({ error: 'ZIP is empty' }, { status: 422 })
      const dataEntry = entries.find(([n]) =>
        !n.toLowerCase().endsWith('.pdf') &&
        !n.toLowerCase().includes('readme') &&
        !n.toLowerCase().includes('layout') &&
        n.trim() !== ''
      ) ?? entries[0]
      text = new TextDecoder('utf-8').decode(dataEntry[1])
    } catch (e) {
      return NextResponse.json({ error: `Unzip failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 422 })
    }
  } else {
    text = await file.text()
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  const { rows, format, phoneColFound, skipReasons } = parseSiftFile(text)

  if (!rows.length) {
    return NextResponse.json({ error: 'No parseable rows found. Ensure this is the extracted CSV from stpMM-DDph.zip.' }, { status: 422 })
  }
  if (!phoneColFound) {
    return NextResponse.json({ error: 'Phone column not found. Download the stpMM-DDph.zip (ph = phone) variant.' }, { status: 422 })
  }

  // ── Phone validation with fallback ────────────────────────────────────────
  let validOutletPhones    = 0   // rows where col-15 was used
  let validTaxpayerPhones  = 0   // rows where col-8 fallback was used
  let noValidPhone         = 0
  let totalValidOutletCol  = 0   // independent col-15 count
  let totalValidTaxpayer   = 0   // independent col-8 count

  const validRows: CompactSiftRow[] = []

  for (const row of rows) {
    const outletNorm = normalizePhone(row.outletPhone)
    const taxNorm    = normalizePhone(row.taxpayerPhone)

    if (outletNorm) totalValidOutletCol++
    if (taxNorm)    totalValidTaxpayer++

    if (outletNorm) {
      validOutletPhones++
      validRows.push({ taxpayerNumber: row.taxpayerNumber, outletNumber: row.outletNumber, phone: outletNorm, phoneSource: 'outlet' })
    } else if (taxNorm) {
      validTaxpayerPhones++
      validRows.push({ taxpayerNumber: row.taxpayerNumber, outletNumber: row.outletNumber, phone: taxNorm,    phoneSource: 'taxpayer' })
    } else {
      noValidPhone++
    }
  }

  // ── Initial DB match ───────────────────────────────────────────────────────
  const db = createServiceClient()
  const uniqueTaxpayers = [...new Set(validRows.map(r => r.taxpayerNumber))]

  interface LeadRecord { id: string; taxpayer_number: string; outlet_number: string | null; permit_phone: string | null }
  const allLeads: LeadRecord[] = []

  for (let i = 0; i < uniqueTaxpayers.length; i += 100) {
    const chunk = uniqueTaxpayers.slice(i, i + 100)
    const { data } = await db
      .from('leads')
      .select('id, taxpayer_number, outlet_number, permit_phone')
      .in('taxpayer_number', chunk)
    if (data) allLeads.push(...(data as LeadRecord[]))
  }

  const leadsByTaxpayer = new Map<string, LeadRecord[]>()
  for (const lead of allLeads) {
    if (!lead.taxpayer_number) continue
    const arr = leadsByTaxpayer.get(lead.taxpayer_number) ?? []
    arr.push(lead)
    leadsByTaxpayer.set(lead.taxpayer_number, arr)
  }

  // Classify each valid row
  let initialMatches = 0
  let alreadySaved   = 0
  const missing: MissingPair[] = []

  // Track unique missing pairs (dedup by key)
  const missingKeySeen = new Set<string>()

  for (const row of validRows) {
    const leads = leadsByTaxpayer.get(row.taxpayerNumber)
    if (!leads?.length) {
      const key = `${row.taxpayerNumber}|${row.outletNumber}`
      if (!missingKeySeen.has(key)) { missingKeySeen.add(key); missing.push({ taxpayerNumber: row.taxpayerNumber, outletNumber: row.outletNumber }) }
      continue
    }
    const exact = leads.find(l => normalizeOutletNumber(l.outlet_number) === row.outletNumber)
    if (!exact) {
      const key = `${row.taxpayerNumber}|${row.outletNumber}`
      if (!missingKeySeen.has(key)) { missingKeySeen.add(key); missing.push({ taxpayerNumber: row.taxpayerNumber, outletNumber: row.outletNumber }) }
      continue
    }
    if (exact.permit_phone === row.phone) alreadySaved++
    else initialMatches++
  }

  return NextResponse.json({
    parsedRows:   validRows,   // client holds this for phase 3
    filename:     fileName,
    format,
    phoneSummary: {
      totalRows:            rows.length,
      validOutletPhones:    totalValidOutletCol,
      validTaxpayerPhones:  totalValidTaxpayer,
      rowsWithAnyPhone:     validRows.length,
      rowsWithNoPhone:      noValidPhone,
      usedOutletPhone:      validOutletPhones,
      usedTaxpayerFallback: validTaxpayerPhones,
    },
    skipReasons,
    initialMatches,
    alreadySaved,
    missing,   // unique (taxpayer, outlet) pairs not in DB
  })
}

// ── Phase 2: Backfill ─────────────────────────────────────────────────────────
//
// Fetches canonical permit records from Socrata for each missing (taxpayer,
// outlet) pair — NO date filter so any-era permits are found.
// Creates leads via batch upsert; CRM fields are absent from payload so they
// are preserved (existing rows) or defaulted (new rows: status='new', etc.).

async function handleBackfill(body: Record<string, unknown>): Promise<NextResponse> {
  const missing = (body.missing as MissingPair[]) ?? []
  if (!missing.length) return NextResponse.json({ created: 0, notFound: 0, socrataErrors: 0, processed: 0 })

  const db = createServiceClient()
  let territory: Awaited<ReturnType<typeof ensureWorkspaceTerritory>>
  try {
    territory = await ensureWorkspaceTerritory()
  } catch (e) {
    return NextResponse.json({ error: `Territory error: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  const deadline = Date.now() + BUDGET_MS

  // Build lookup set of missing keys
  const missingSet = new Set(missing.map(m => `${m.taxpayerNumber}|${m.outletNumber}`))
  const uniqueTaxpayers = [...new Set(missing.map(m => m.taxpayerNumber))]

  const toUpsert: Record<string, unknown>[] = []
  let socrataErrors = 0

  // Query Socrata for each batch of taxpayer numbers (no date filter)
  for (let i = 0; i < uniqueTaxpayers.length; i += SOCRATA_BATCH) {
    if (Date.now() > deadline) break

    const batch = uniqueTaxpayers.slice(i, i + SOCRATA_BATCH)
    // Socrata SoQL IN syntax: taxpayer_number in('xxxxxxxx','yyyyyyyy')
    const inClause = batch.map(n => `'${n}'`).join(',')

    const params = new URLSearchParams({
      '$where':  `taxpayer_number in(${inClause})`,
      '$select': TEXAS_FIELDS,
      '$limit':  '5000',   // up to 50 outlets per taxpayer × 100 taxpayers
    })

    try {
      const resp = await fetch(`${TEXAS_API}?${params}`, { signal: AbortSignal.timeout(20_000) })
      if (!resp.ok) { socrataErrors += batch.length; continue }

      const records: Record<string, string>[] = await resp.json()

      for (const raw of records) {
        const taxpayerNum = normalize(raw.taxpayer_number)
        const outletNum   = normalizeOutletNumber(raw.outlet_number)

        if (!taxpayerNum || outletNum === '') continue

        const key = `${taxpayerNum}|${outletNum}`
        if (!missingSet.has(key)) continue   // not a pair we need

        const permitDate = parseDate(raw.outlet_permit_issue_date)
        if (!permitDate) continue

        const firstSalesDate = parseDate(raw.outlet_first_sales_date)
        const outletName     = normalize(raw.outlet_name)
        const taxpayerName   = normalize(raw.taxpayer_name)
        const displayName    = outletName ?? taxpayerName ?? null

        const scored = scoreLead({
          naicsCode:                normalize(raw.outlet_naics_code),
          permitIssueDate:          permitDate,
          firstSalesDate,
          businessName:             displayName,
          outletName,
          taxpayerName,
          outletAddress:            normalize(raw.outlet_address),
          taxpayerOrganizationType: normalize(raw.taxpayer_organization_type),
        })

        // CRM fields intentionally omitted — DB defaults apply for new rows;
        // existing rows keep their CRM values via partial-column upsert semantics.
        toUpsert.push({
          territory_id:               territory.id,
          source:                     'texas_sales_tax_permits',
          taxpayer_number:            taxpayerNum,
          outlet_number:              outletNum,
          taxpayer_name:              taxpayerName,
          taxpayer_address:           normalize(raw.taxpayer_address),
          taxpayer_city:              normalize(raw.taxpayer_city),
          taxpayer_state:             normalize(raw.taxpayer_state),
          taxpayer_zip:               normalize(raw.taxpayer_zip_code),
          taxpayer_county_code:       normalize(raw.taxpayer_county_code),
          taxpayer_organization_type: normalize(raw.taxpayer_organization_type),
          outlet_name:                outletName,
          outlet_address:             normalize(raw.outlet_address),
          outlet_city:                normalize(raw.outlet_city),
          outlet_state:               normalize(raw.outlet_state),
          outlet_zip:                 normalize(raw.outlet_zip_code),
          outlet_county_code:         normalize(raw.outlet_county_code),
          naics_code:                 normalize(raw.outlet_naics_code),
          inside_outside_city:        normalize(raw.outlet_inside_outside_city_limits_indicator),
          permit_issue_date:          permitDate,
          first_sales_date:           firstSalesDate,
          raw_record:                 raw,
          last_seen_at:               new Date().toISOString(),
          display_name:               displayName,
          score:                      scored.score,
          priority:                   scored.priority,
          score_reasons:              scored.reasons,
          category:                   scored.category ?? undefined,
        })

        missingSet.delete(key)   // mark as resolved
      }
    } catch (e) {
      console.error('[sift-upload/backfill] Socrata error:', e instanceof Error ? e.message : String(e))
      socrataErrors += batch.length
    }
  }

  // Bulk upsert: create new, update source-fields on existing (CRM preserved)
  let created = 0
  for (let i = 0; i < toUpsert.length; i += DB_BATCH) {
    if (Date.now() > deadline) break
    const batch = toUpsert.slice(i, i + DB_BATCH)
    const { error: upErr, data: upData } = await db
      .from('leads')
      .upsert(batch, {
        onConflict:       'source,taxpayer_number,outlet_number',
        ignoreDuplicates: false,  // update source fields even if lead exists
      })
      .select('id')

    if (upErr) {
      console.error('[sift-upload/backfill] upsert error:', upErr.message, upErr.code)
    } else {
      created += upData?.length ?? batch.length
    }
  }

  const notFound = missingSet.size   // still unresolved after Socrata search

  return NextResponse.json({
    created,
    notFound,
    socrataErrors,
    processed: missing.length,   // total pairs attempted this call
  })
}

// ── Phase 3: Match ────────────────────────────────────────────────────────────
//
// Matches ALL valid-phone rows against the (now-expanded) DB.
// Saves permit_phone; never touches primary_phone or CRM fields.
// Logs to sift_import_log.

async function handleMatch(body: Record<string, unknown>): Promise<NextResponse> {
  const rows     = (body.rows     as CompactSiftRow[]) ?? []
  const filename = (body.filename as string)           ?? 'unknown'

  if (!rows.length) return NextResponse.json({ matched: 0, phonesAdded: 0 })

  const db = createServiceClient()
  const uniqueTaxpayers = [...new Set(rows.map(r => r.taxpayerNumber))]

  interface LeadRecord { id: string; taxpayer_number: string; outlet_number: string | null; permit_phone: string | null }
  const allLeads: LeadRecord[] = []

  for (let i = 0; i < uniqueTaxpayers.length; i += 100) {
    const chunk = uniqueTaxpayers.slice(i, i + 100)
    const { data } = await db
      .from('leads')
      .select('id, taxpayer_number, outlet_number, permit_phone')
      .in('taxpayer_number', chunk)
    if (data) allLeads.push(...(data as LeadRecord[]))
  }

  const leadsByTaxpayer = new Map<string, LeadRecord[]>()
  for (const lead of allLeads) {
    if (!lead.taxpayer_number) continue
    const arr = leadsByTaxpayer.get(lead.taxpayer_number) ?? []
    arr.push(lead)
    leadsByTaxpayer.set(lead.taxpayer_number, arr)
  }

  // Build match results
  let matched          = 0
  let alreadySaved     = 0
  let taxpayerNotFound = 0
  let outletNotFound   = 0

  interface UpdateRow { id: string; phone: string }
  const toUpdate: UpdateRow[] = []

  for (const row of rows) {
    const leads = leadsByTaxpayer.get(row.taxpayerNumber)
    if (!leads?.length) { taxpayerNotFound++; continue }

    const exact = leads.find(l => normalizeOutletNumber(l.outlet_number) === row.outletNumber)
    if (!exact) { outletNotFound++; continue }

    matched++
    if (exact.permit_phone === row.phone) { alreadySaved++; continue }
    toUpdate.push({ id: exact.id, phone: row.phone })
  }

  // Batch-parallel UPDATE for permit_phone
  const importedAt = new Date().toISOString()
  const source     = `sift_weekly:${filename.replace(/^.*\//, '')}`
  let phonesAdded  = 0
  let errors       = 0

  for (let i = 0; i < toUpdate.length; i += MAX_CONCURRENT) {
    const chunk   = toUpdate.slice(i, i + MAX_CONCURRENT)
    const results = await Promise.all(
      chunk.map(async ({ id, phone }) => {
        const { error } = await db
          .from('leads')
          .update({
            permit_phone:             phone,
            permit_phone_source:      source,
            permit_phone_imported_at: importedAt,
          })
          .eq('id', id)
        return !error
      })
    )
    for (const ok of results) { if (ok) phonesAdded++; else errors++ }
  }

  // Log to sift_import_log
  const logFilename = filename.replace(/^.*\//, '').replace(/\.zip$/i, '.csv')
  try {
    await db.from('sift_import_log').upsert({
      filename:       logFilename,
      status:         'completed',
      records_parsed: rows.length,
      leads_matched:  matched,
      phones_added:   phonesAdded,
      phones_skipped: taxpayerNotFound + outletNotFound,
      error_message:  JSON.stringify({
        matchBreakdown: { matched, phonesAdded, alreadySaved, taxpayerNotFound, outletNotFound, errors },
      }),
      imported_at: importedAt,
    }, { onConflict: 'filename' })
  } catch (e) { console.error('[sift-upload/match] log write failed:', e) }

  return NextResponse.json({
    matched,
    phonesAdded,
    alreadySaved,
    taxpayerNotFound,
    outletNotFound,
    errors,
  })
}
