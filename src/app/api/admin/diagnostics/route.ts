/**
 * GET /api/admin/diagnostics
 *
 * Returns live counts for the Texas Leads database:
 * - Total leads / with phone / without phone
 * - Per-region callable counts (DFW, Houston, Austin, San Antonio, Other Texas, All)
 * - Latest SIFT import log
 * - Latest permit import run
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { REGION_DEFINITIONS } from '@/lib/regions'

// Texas metro county codes for "Other Texas" computation
const ALL_METRO_CODES = new Set([
  ...REGION_DEFINITIONS.DFW,
  ...REGION_DEFINITIONS.Houston,
  ...REGION_DEFINITIONS.Austin,
  ...REGION_DEFINITIONS['San Antonio'],
  ...REGION_DEFINITIONS['El Paso'],
])

export async function GET(): Promise<NextResponse> {
  const db = createServiceClient()

  // Run core counts in parallel
  const [
    totalResult,
    withPhoneResult,
    withPermitPhoneResult,
    withPrimaryPhoneResult,
    countiesResult,
    lastImportResult,
    lastSiftResult,
  ] = await Promise.all([
    db.from('leads').select('*', { count: 'exact', head: true }),
    db.from('leads').select('*', { count: 'exact', head: true })
      .or('permit_phone.not.is.null,primary_phone.not.is.null'),
    db.from('leads').select('*', { count: 'exact', head: true })
      .not('permit_phone', 'is', null),
    db.from('leads').select('*', { count: 'exact', head: true })
      .not('primary_phone', 'is', null),
    // Distinct counties with callable leads
    db.from('leads')
      .select('outlet_county_code')
      .or('permit_phone.not.is.null,primary_phone.not.is.null')
      .not('outlet_county_code', 'is', null),
    db.from('import_runs')
      .select('id, status, fetched_count, inserted_count, updated_count, skipped_count, error_message, started_at, completed_at, county_codes')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('sift_import_log')
      .select('filename, status, records_parsed, leads_matched, phones_added, phones_skipped, imported_at, error_message')
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const total = totalResult.count ?? 0
  const withPhone = withPhoneResult.count ?? 0
  const withPermitPhone = withPermitPhoneResult.count ?? 0
  const withPrimaryPhone = withPrimaryPhoneResult.count ?? 0

  // Build per-region callable counts from the counties data
  const allCountyRows = (countiesResult.data ?? []) as { outlet_county_code: string }[]

  // Count callable leads per county
  const callableByCounty = new Map<string, number>()
  for (const row of allCountyRows) {
    if (!row.outlet_county_code) continue
    callableByCounty.set(row.outlet_county_code, (callableByCounty.get(row.outlet_county_code) ?? 0) + 1)
  }

  function sumForCodes(codes: string[]): number {
    return codes.reduce((sum, c) => sum + (callableByCounty.get(c) ?? 0), 0)
  }

  const otherTexasCodes = [...callableByCounty.keys()].filter(c => !ALL_METRO_CODES.has(c))

  const regions = {
    DFW:          sumForCodes(REGION_DEFINITIONS.DFW),
    Houston:      sumForCodes(REGION_DEFINITIONS.Houston),
    Austin:       sumForCodes(REGION_DEFINITIONS.Austin),
    'San Antonio': sumForCodes(REGION_DEFINITIONS['San Antonio']),
    'El Paso':    sumForCodes(REGION_DEFINITIONS['El Paso']),
    'Other Texas': sumForCodes(otherTexasCodes),
    'All Texas':  withPhone,
  }

  return NextResponse.json({
    database: {
      total,
      withPhone,
      withoutPhone: total - withPhone,
      withPermitPhone,
      withPrimaryPhone,
    },
    regions,
    lastImport: lastImportResult.data ?? null,
    lastSift:   lastSiftResult.data ?? null,
  })
}
