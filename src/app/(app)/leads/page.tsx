import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import type { LeadsFilters, Lead } from '@/lib/types'
import { LEADS_PER_PAGE } from '@/lib/types'
import { DFW_COUNTIES, COUNTY_NAMES } from '@/lib/constants'
import { getRegionCounties } from '@/lib/regions'
import { LeadsFiltersBar } from '@/components/leads/LeadsFiltersBar'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { BulkEnrichBar } from '@/components/leads/BulkEnrichBar'
import { Pagination } from '@/components/ui/Pagination'
import { RefreshButton } from '@/components/ui/RefreshButton'

// NULL-safe non-chain filter — neq silently excludes NULL rows in PostgreSQL
const NON_CHAIN = 'category.is.null,category.neq.corporate_chain'

export const metadata: Metadata = { title: 'Leads — Merchant Radar' }
export const dynamic = 'force-dynamic'

interface PageProps { searchParams: Promise<Record<string, string>> }

export default async function LeadsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const supabase = createServiceClient()

  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * LEADS_PER_PAGE
  const to = from + LEADS_PER_PAGE - 1

  // hideCorporateChains defaults to TRUE — user must explicitly pass showChains=true to see them
  const hideCorporateChains = sp.showChains !== 'true'

  // hasPhone defaults to TRUE — show callable leads (permit_phone OR primary_phone) unless
  // the user explicitly passes ?hasPhone=false to show all leads including those without phones
  const hasPhone = sp.hasPhone !== 'false'

  const filters: LeadsFilters = {
    search: sp.search || '',
    status: (sp.status as LeadsFilters['status']) ?? 'new',
    priority: (sp.priority as LeadsFilters['priority']) || '',
    county: sp.county || '',
    city: sp.city || '',
    permitDateFrom: sp.permitDateFrom || '',
    permitDateTo: sp.permitDateTo || '',
    firstSalesDateFrom: sp.firstSalesDateFrom || '',
    firstSalesDateTo: sp.firstSalesDateTo || '',
    openingSoon: sp.openingSoon === 'true',
    neverContacted: sp.neverContacted === 'true',
    followUpDue: sp.followUpDue === 'true',
    starred: sp.starred === 'true',
    hasPhone,
    missingPhone: sp.missingPhone === 'true',
    region: sp.region || '',
    hasWebsite: sp.hasWebsite === 'true',
    missingWebsite: sp.missingWebsite === 'true',
    enriched: sp.enriched === 'true',
    needsReview: sp.needsReview === 'true',
    hideCorporateChains,
    sort: (sp.sort as LeadsFilters['sort']) || 'score',
    order: (sp.order as 'asc' | 'desc') || 'desc',
    page,
  }
  // Fetch active territory to obtain saved region default (if user hasn't provided region via URL)
  const { data: territories } = await supabase.from('territories').select('*').eq('is_active', true).limit(1)
  const activeTerritory = territories?.[0] ?? null
  const regionParam = filters.region || (activeTerritory?.region ?? 'DFW')
  let regionCounties = getRegionCounties(regionParam)

  // Special-case Other Texas: compute all county codes present in DB, then exclude named metro counties
  if (regionParam === 'Other Texas') {
    const { data: allCountyRows } = await supabase
      .from('leads')
      .select('outlet_county_code')
      .not('outlet_county_code', 'is', null)

    const allCodes = Array.from(new Set((allCountyRows ?? []).map((r: any) => r.outlet_county_code).filter(Boolean)))
    // Build union of named metros
    const { DFW_COUNTY_ALLOWLIST } = await import('@/lib/importer-utils')
    const { REGION_DEFINITIONS } = await import('@/lib/regions')
    const metroCodes = new Set<string>([
      ...REGION_DEFINITIONS.DFW,
      ...REGION_DEFINITIONS.Houston,
      ...REGION_DEFINITIONS.Austin,
      ...REGION_DEFINITIONS['San Antonio'],
      ...REGION_DEFINITIONS['El Paso'],
    ])
    regionCounties = allCodes.filter((c: string) => !metroCodes.has(c))
  }

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })

  // Apply region pre-filter when no explicit county filter is set and the region defines counties
  if (!filters.county && regionCounties && regionCounties.length > 0) {
    query = query.in('outlet_county_code', regionCounties)
  }

  if (filters.search) {
    const s = `%${filters.search}%`
    // If the search looks like a phone number (digits only or contains many digits),
    // we'll handle phone normalization on the server by fetching a broader set and
    // filtering client-side. Also when searching, prefer showing matches across all statuses.
    const digitOnly = (filters.search || '').replace(/\D/g, '')
    const isPhoneLike = digitOnly.length >= 7

    if (isPhoneLike) {
      // Broad OR across text fields (keeps region filter) but avoid status restriction below
      query = query.or(
        `display_name.ilike.${s},outlet_name.ilike.${s},taxpayer_name.ilike.${s},outlet_city.ilike.${s},outlet_zip.ilike.${s},naics_code.ilike.${s}`
      )
      // mark phoneSearch to post-filter results client-side
      ;(query as any)._phoneSearch = digitOnly
    } else {
      query = query.or(
        `display_name.ilike.${s},outlet_name.ilike.${s},taxpayer_name.ilike.${s},primary_phone.ilike.${s},outlet_city.ilike.${s},outlet_zip.ilike.${s},naics_code.ilike.${s}`
      )
    }
  }
  const statusParamPresent = Object.prototype.hasOwnProperty.call(sp, 'status')
  if (statusParamPresent) {
    if (sp.status !== 'all' && sp.status !== '') {
      query = query.eq('status', sp.status)
    }
    // if 'all' or '' -> no status filter
  } else {
    // no explicit status param -> default to new
    query = query.eq('status', 'new')
  }
  if (filters.priority) query = query.eq('priority', filters.priority)
  if (filters.county) query = query.eq('outlet_county_code', filters.county)
  if (filters.city) query = query.ilike('outlet_city', `%${filters.city}%`)
  if (filters.permitDateFrom) query = query.gte('permit_issue_date', filters.permitDateFrom)
  if (filters.permitDateTo) query = query.lte('permit_issue_date', filters.permitDateTo)
  if (filters.firstSalesDateFrom) query = query.gte('first_sales_date', filters.firstSalesDateFrom)
  if (filters.firstSalesDateTo) query = query.lte('first_sales_date', filters.firstSalesDateTo)
  if (filters.openingSoon) query = query.gte('first_sales_date', new Date().toISOString().slice(0, 10))
  if (filters.neverContacted) query = query.is('last_contacted_at', null)
  if (filters.followUpDue) query = query.lte('next_follow_up_at', new Date().toISOString())
  if (filters.starred) query = query.eq('starred', true)
  // hasPhone: lead has any callable phone (permit phone or manually entered)
  if (filters.hasPhone) query = query.or('primary_phone.not.is.null,permit_phone.not.is.null')
  // missingPhone: truly no phone of any kind
  if (filters.missingPhone) query = query.is('primary_phone', null).is('permit_phone', null)
  if (filters.hasWebsite) query = query.not('website', 'is', null)
  if (filters.missingWebsite) query = query.is('website', null)
  if (filters.enriched) query = query.eq('enrichment_status', 'completed')
  if (filters.needsReview) query = query.eq('enrichment_status', 'pending')
  // NULL-safe chain filter: category IS NULL (independent leads) must pass through.
  // neq silently excludes NULL rows in PostgreSQL — use explicit OR instead.
  if (filters.hideCorporateChains) query = query.or(NON_CHAIN)

  const sortCol =
    filters.sort === 'score' ? 'score'
    : filters.sort === 'permit_issue_date' ? 'permit_issue_date'
    : filters.sort === 'first_sales_date' ? 'first_sales_date'
    : filters.sort === 'next_follow_up_at' ? 'next_follow_up_at'
    : 'created_at'
  query = query.order(sortCol, { ascending: filters.order === 'asc', nullsFirst: false })
  // Secondary sort: when ordering by score, also sort by nearest first_sales_date
  // so upcoming openings appear before already-open leads of equal score.
  if (sortCol === 'score') {
    query = query.order('first_sales_date', { ascending: true, nullsFirst: false })
  }

  // If we marked this query for phoneSearch, fetch a larger result set and post-filter client-side.
  let leadsData: any[] = []
  let totalCount = 0
  const phoneSearchDigits = (query as any)?._phoneSearch
  if (phoneSearchDigits) {
    // fetch a broad set (limit to 5000) to safely match normalized phone numbers client-side
    const { data: allLeads } = await query.range(0, 4999)
    leadsData = allLeads ?? []
    // client-side normalize and filter by phone digits (match end or exact)
    const norm = (s: string | null | undefined) => (s || '').toString().replace(/\D/g, '')
    const filtered = leadsData.filter(l => {
      const phones = [l.permit_phone, l.primary_phone]
      return phones.some(p => {
        const pnorm = norm(p)
        if (!pnorm) return false
        const pnormNo1 = pnorm.replace(/^1/, '')
        const searchNo1 = phoneSearchDigits.replace(/^1/, '')
        return pnorm === phoneSearchDigits || pnormNo1 === phoneSearchDigits || pnorm.endsWith(phoneSearchDigits) || pnormNo1.endsWith(searchNo1)
      })
    })
    totalCount = filtered.length
    leadsData = filtered.slice(from, to + 1)
  } else {
    const { data: leads, count } = await query.range(from, to)
    leadsData = leads ?? []
    totalCount = count ?? 0
  }
  const totalPages = Math.ceil((totalCount ?? 0) / LEADS_PER_PAGE)

  // Check whether any leads exist at all (for empty-state messaging)
  const hasAnyLeads = (totalCount ?? 0) > 0 || Object.values({
    search: filters.search,
    status: filters.status,
    priority: filters.priority,
    county: filters.county,
  }).some(Boolean)

  // Counties for filter dropdown
  const { data: countyRows } = await supabase
    .from('leads')
    .select('outlet_county_code')
    .not('outlet_county_code', 'is', null)

  const counties = [
    ...new Set((countyRows ?? []).map(r => r.outlet_county_code).filter(Boolean)),
  ]
    .map(code => ({ code: code!, name: COUNTY_NAMES[code!] ?? code! }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Total count without filters (to detect zero-import state)
  const { count: totalAll } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })

  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
          {totalCount != null && hasAnyLeads && (
            <p className="text-sm text-gray-500 mt-0.5">
              {totalCount.toLocaleString()}{' '}
              {filters.hasPhone ? 'callable lead' : 'lead'}{totalCount !== 1 ? 's' : ''}
            </p>
          )}
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

      <LeadsFiltersBar filters={filters} counties={counties} />

      {/* Bulk enrichment hidden in simplified outreach mode */}

      {leadsData && leadsData.length > 0 ? (
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
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters.</p>
        </div>
      )}
    </div>
  )
}
