import { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import type { LeadsFilters, Lead } from '@/lib/types'
import { LEADS_PER_PAGE } from '@/lib/types'
import { COUNTY_NAMES } from '@/lib/constants'
import { getRegionCounties, REGION_DEFINITIONS } from '@/lib/regions'
import { LeadsFiltersBar } from '@/components/leads/LeadsFiltersBar'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { Pagination } from '@/components/ui/Pagination'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { LEAD_LIST_COLUMNS, parseMissingColumn } from '@/lib/supabase/resilient-select'

// NULL-safe non-chain filter — neq silently excludes NULL rows in PostgreSQL
const NON_CHAIN = 'category.is.null,category.neq.corporate_chain'

// Static set of all named-metro county codes — used for "Other Texas" without a DB scan
const ALL_METRO_CODES = new Set([
  ...REGION_DEFINITIONS.DFW,
  ...REGION_DEFINITIONS.Houston,
  ...REGION_DEFINITIONS.Austin,
  ...REGION_DEFINITIONS['San Antonio'],
  ...REGION_DEFINITIONS['El Paso'],
])

export const metadata: Metadata = { title: 'Leads — Merchant Radar' }
export const dynamic = 'force-dynamic'

interface PageProps { searchParams: Promise<Record<string, string>> }

export default async function LeadsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const supabase = createServiceClient()

  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * LEADS_PER_PAGE
  const to   = from + LEADS_PER_PAGE - 1

  // hideCorporateChains is NOT a default — must be explicitly opted-in via ?showChains=false
  // Keeping it as a hidden default caused the Leads count to silently differ from Imports
  const hideCorporateChains = sp.showChains === 'false'
  // hasPhone is opt-in only — a hidden default hid most of the database
  const hasPhone = sp.hasPhone === 'true'
  const statusParamPresent = Object.prototype.hasOwnProperty.call(sp, 'status')
  const statusFilter = statusParamPresent
    ? ((sp.status as LeadsFilters['status']) || 'all')
    : 'all'

  const filters: LeadsFilters = {
    search:            sp.search || '',
    status:            statusFilter === 'all' ? '' : statusFilter,
    priority:          (sp.priority as LeadsFilters['priority']) || '',
    county:            sp.county || '',
    city:              sp.city || '',
    permitDateFrom:    sp.permitDateFrom || '',
    permitDateTo:      sp.permitDateTo || '',
    firstSalesDateFrom: sp.firstSalesDateFrom || '',
    firstSalesDateTo:  sp.firstSalesDateTo || '',
    openingSoon:       sp.openingSoon === 'true',
    neverContacted:    sp.neverContacted === 'true',
    followUpDue:       sp.followUpDue === 'true',
    starred:           sp.starred === 'true',
    hasPhone,
    missingPhone:      sp.missingPhone === 'true',
    region:            sp.region || 'All Texas',
    leadSource:        (sp.leadSource as LeadsFilters['leadSource']) || '',
    hasWebsite:        sp.hasWebsite === 'true',
    missingWebsite:    sp.missingWebsite === 'true',
    enriched:          sp.enriched === 'true',
    needsReview:       sp.needsReview === 'true',
    hideCorporateChains,
    sort:              (sp.sort as LeadsFilters['sort']) || 'score',
    order:             (sp.order as 'asc' | 'desc') || 'desc',
    proposalActivity:  (sp.proposalActivity as LeadsFilters['proposalActivity']) || '',
    page,
  }

  // ── Territory / region ────────────────────────────────────────────────────
  const { data: territories } = await supabase
    .from('territories').select('region,days_to_import').eq('is_active', true).limit(1)
  const activeTerritory = territories?.[0] ?? null
  // Default region is 'All Texas' (already set in filters above).
  // Explicit URL param or territory saved view override it, but 'All Texas' is the baseline.
  const regionParam = filters.region || activeTerritory?.region || 'All Texas'

  // "Other Texas" — compute from static county map (no DB scan)
  let regionCounties: string[]
  if (regionParam === 'Other Texas') {
    regionCounties = Object.keys(COUNTY_NAMES).filter(c => !ALL_METRO_CODES.has(c))
  } else {
    regionCounties = getRegionCounties(regionParam)
  }

  // ── Build Supabase query ──────────────────────────────────────────────────
  // Retry after stripping any column that is not yet migrated in production.
  let selectColumns = [...LEAD_LIST_COLUMNS]
  const strippedColumns: string[] = []

  // Status — no hidden default. Missing `status` or status=all → every lead.
  const applyStatus = statusFilter && statusFilter !== 'all'
  const applyLeadSource = Boolean(filters.leadSource) && selectColumns.includes('lead_source_label')

  function buildLeadsQuery(cols: string[]) {
    let query = supabase.from('leads').select(cols.join(','), { count: 'exact' })

    if (!filters.county && regionCounties.length > 0) {
      query = query.in('outlet_county_code', regionCounties)
    }

    if (filters.search) {
      const s = `%${filters.search}%`
      const digitOnly = filters.search.replace(/\D/g, '')
      const isPhoneLike = digitOnly.length >= 7

      if (isPhoneLike) {
        query = query.or(
          `display_name.ilike.${s},outlet_name.ilike.${s},taxpayer_name.ilike.${s},outlet_city.ilike.${s},outlet_zip.ilike.${s},naics_code.ilike.${s}`
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(query as any)._phoneSearch = digitOnly
      } else {
        query = query.or(
          `display_name.ilike.${s},outlet_name.ilike.${s},taxpayer_name.ilike.${s},primary_phone.ilike.${s},outlet_city.ilike.${s},outlet_zip.ilike.${s},naics_code.ilike.${s}`
        )
      }
    }

    if (applyStatus) query = query.eq('status', statusFilter)
    if (filters.priority)        query = query.eq('priority', filters.priority)
    if (filters.county)          query = query.eq('outlet_county_code', filters.county)
    if (filters.city)            query = query.ilike('outlet_city', `%${filters.city}%`)
    if (filters.permitDateFrom)  query = query.gte('permit_issue_date', filters.permitDateFrom)
    if (filters.permitDateTo)    query = query.lte('permit_issue_date', filters.permitDateTo)
    if (filters.firstSalesDateFrom) query = query.gte('first_sales_date', filters.firstSalesDateFrom)
    if (filters.firstSalesDateTo)   query = query.lte('first_sales_date', filters.firstSalesDateTo)
    if (filters.openingSoon)     query = query.gte('first_sales_date', new Date().toISOString().slice(0, 10))
    if (filters.neverContacted)  query = query.is('last_contacted_at', null)
    if (filters.followUpDue)     query = query.lte('next_follow_up_at', new Date().toISOString())
    if (filters.starred)         query = query.eq('starred', true)
    if (filters.hasPhone)        query = query.or('primary_phone.not.is.null,permit_phone.not.is.null')
    if (filters.missingPhone)    query = query.is('primary_phone', null).is('permit_phone', null)
    if (applyLeadSource && cols.includes('lead_source_label')) {
      query = query.eq('lead_source_label', filters.leadSource)
    }
    if (filters.hasWebsite)      query = query.not('website', 'is', null)
    if (filters.missingWebsite)  query = query.is('website', null)
    if (filters.enriched)        query = query.eq('enrichment_status', 'completed')
    if (filters.needsReview)     query = query.eq('enrichment_status', 'pending')
    if (filters.hideCorporateChains) query = query.or(NON_CHAIN)

    if (filters.proposalActivity === 'viewed' && cols.includes('proposal_view_count')) {
      query = query.gt('proposal_view_count', 0)
    } else if (filters.proposalActivity === 'not_viewed' && cols.includes('proposal_view_count')) {
      query = query.or('proposal_view_count.eq.0,proposal_view_count.is.null')
    } else if (filters.proposalActivity === 'viewed_multiple' && cols.includes('proposal_view_count')) {
      query = query.gte('proposal_view_count', 3)
    } else if (filters.proposalActivity === 'agreement' && cols.includes('proposal_status')) {
      query = query.in('proposal_status', ['accepted', 'agreement_requested'])
    }

    const sortCol =
      filters.sort === 'score'                   ? 'score'
      : filters.sort === 'permit_issue_date'       ? 'permit_issue_date'
      : filters.sort === 'first_sales_date'        ? 'first_sales_date'
      : filters.sort === 'next_follow_up_at'       ? 'next_follow_up_at'
      : filters.sort === 'proposal_view_count'     ? 'proposal_view_count'
      : filters.sort === 'proposal_last_viewed_at' ? 'proposal_last_viewed_at'
      : 'created_at'
    const safeSort = cols.includes(sortCol) ? sortCol : 'created_at'
    query = query.order(safeSort, { ascending: filters.order === 'asc', nullsFirst: false })
    if (safeSort === 'score' && cols.includes('first_sales_date')) {
      query = query.order('first_sales_date', { ascending: true, nullsFirst: false })
    }

    return query
  }

  // ── Execute query (strip missing columns and retry) ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leadsData: any[] = []
  let totalCount = 0
  let queryError: string | null = null

  for (let attempt = 0; attempt < 20; attempt++) {
    const query = buildLeadsQuery(selectColumns)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const phoneSearchDigits = (query as any)?._phoneSearch

    if (phoneSearchDigits) {
      const { data: allLeads, error } = await query.range(0, 4999)
      if (error) {
        const missing = parseMissingColumn(error.message)
        if (missing && selectColumns.includes(missing)) {
          selectColumns = selectColumns.filter(c => c !== missing)
          strippedColumns.push(missing)
          continue
        }
        queryError = error.message
        console.error('[leads page] query failed:', error.message)
        break
      }
      leadsData = allLeads ?? []
      const norm = (s: string | null | undefined) => (s || '').toString().replace(/\D/g, '')
      const filtered = leadsData.filter(l =>
        [l.permit_phone, l.primary_phone].some(p => {
          const pnorm = norm(p)
          if (!pnorm) return false
          const pNorm1  = pnorm.replace(/^1/, '')
          const sNorm1  = phoneSearchDigits.replace(/^1/, '')
          return pnorm === phoneSearchDigits || pNorm1 === sNorm1 ||
                 pnorm.endsWith(phoneSearchDigits) || pNorm1.endsWith(sNorm1)
        })
      )
      totalCount = filtered.length
      leadsData  = filtered.slice(from, to + 1)
      break
    }

    const { data: leads, count, error } = await query.range(from, to)
    if (error) {
      const missing = parseMissingColumn(error.message)
      if (missing && selectColumns.includes(missing)) {
        selectColumns = selectColumns.filter(c => c !== missing)
        strippedColumns.push(missing)
        continue
      }
      queryError = error.message
      console.error('[leads page] query failed:', error.message)
      break
    }
    leadsData  = leads ?? []
    totalCount = count ?? 0
    break
  }

  if (strippedColumns.length > 0) {
    console.warn('[leads page] stripped missing columns:', strippedColumns)
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[leads page] rows: ${leadsData?.length}, approx bytes: ${JSON.stringify(leadsData).length}`)
  }

  const totalPages = Math.ceil(totalCount / LEADS_PER_PAGE)

  // ── Counties for filter dropdown — from static map, no DB scan ────────────
  // Filter to counties in the current region if one is selected
  const allCountyCodes = Object.keys(COUNTY_NAMES)
  const relevantCodes = regionCounties.length > 0 ? regionCounties : allCountyCodes
  const counties = relevantCodes
    .map(code => ({ code, name: COUNTY_NAMES[code] ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // ── Zero-state check (single lightweight count) ───────────────────────────
  const { count: totalAll } = await supabase
    .from('leads').select('*', { count: 'exact', head: true })

  // ── Total callable All Texas (all statuses) — matches Imports diagnostics logic ──
  // permit_phone OR primary_phone — no region/status/chain restriction
  const { count: totalCallableAllTX } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .or('permit_phone.not.is.null,primary_phone.not.is.null')

  const [
    { count: cAll },
    { count: cNew },
    { count: cAttempted },
    { count: cConnected },
    { count: cFollowUp },
    { count: cAppointment },
    { count: cWon },
    { count: cLost },
    { count: cDnc },
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'attempted'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'connected'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'follow_up'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'appointment'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'won'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'lost'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'do_not_contact'),
  ])

  const statusCounts: Record<string, number> = {
    all:            cAll ?? totalAll ?? 0,
    new:            cNew ?? 0,
    attempted:      cAttempted ?? 0,
    connected:      cConnected ?? 0,
    follow_up:      cFollowUp ?? 0,
    appointment:    cAppointment ?? 0,
    won:            cWon ?? 0,
    lost:           cLost ?? 0,
    do_not_contact: cDnc ?? 0,
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
          {/* Dual count: total callable statewide vs current filtered queue */}
          <div className="mt-0.5 space-y-0.5">
            {(totalCallableAllTX ?? 0) > 0 && (
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">{(totalCallableAllTX ?? 0).toLocaleString()}</span>
                {' '}total callable in Texas
              </p>
            )}
            <p className="text-sm text-gray-400">
              <span className="font-semibold text-gray-600">{totalCount.toLocaleString()}</span>
              {' '}in current queue
              {statusFilter && statusFilter !== 'all' && (
                <span className="ml-1 text-gray-400">
                  ({statusFilter === 'attempted' ? 'Contacted' : statusFilter})
                </span>
              )}
              {(!statusFilter || statusFilter === 'all') && (
                <span className="ml-1 text-gray-400">(All)</span>
              )}
              {filters.region && filters.region !== 'All Texas' && (
                <span className="ml-1 text-gray-400">· {filters.region}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <a
            href={`/api/leads/export?${new URLSearchParams(sp).toString()}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Export CSV
          </a>
        </div>
      </div>

      <LeadsFiltersBar
        filters={{ ...filters, status: statusFilter === 'all' ? '' : statusFilter }}
        counties={counties}
        statusCounts={statusCounts}
        activeStatus={statusFilter}
      />

      {queryError ? (
        <div className="text-center py-16 bg-white rounded-xl border border-red-200 px-6">
          <p className="text-gray-800 font-semibold">Leads could not load</p>
          <p className="text-sm font-mono text-red-700 mt-2 break-words">{queryError}</p>
        </div>
      ) : leadsData.length > 0 ? (
        <>
          <LeadsTable leads={leadsData as Lead[]} />
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination currentPage={page} totalPages={totalPages} filters={sp} />
            </div>
          )}
        </>
      ) : totalAll === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-700 font-semibold text-lg">No leads yet</p>
          <p className="text-sm text-gray-400 mt-2">Import Texas leads to begin — click &quot;Import Texas Leads&quot; on the Dashboard.</p>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 font-medium">No matching leads</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or switching the Pipeline status.</p>
          {statusFilter === 'new' && (statusCounts.attempted ?? 0) > 0 && (
            <Link
              href={`/leads?${new URLSearchParams({ ...sp, status: 'attempted', page: '1' }).toString()}`}
              className="inline-flex mt-4 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
            >
              View contacted leads ({statusCounts.attempted.toLocaleString()})
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
