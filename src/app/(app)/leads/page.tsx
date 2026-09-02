import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import type { LeadsFilters, Lead } from '@/lib/types'
import { LEADS_PER_PAGE } from '@/lib/types'
import { DFW_COUNTIES } from '@/lib/constants'
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
    status: (sp.status as LeadsFilters['status']) || '',
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
    hasWebsite: sp.hasWebsite === 'true',
    missingWebsite: sp.missingWebsite === 'true',
    enriched: sp.enriched === 'true',
    needsReview: sp.needsReview === 'true',
    hideCorporateChains,
    sort: (sp.sort as LeadsFilters['sort']) || 'score',
    order: (sp.order as 'asc' | 'desc') || 'desc',
    page,
  }

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })

  if (filters.search) {
    const s = `%${filters.search}%`
    query = query.or(
      `display_name.ilike.${s},outlet_name.ilike.${s},taxpayer_name.ilike.${s},primary_phone.ilike.${s},outlet_city.ilike.${s},outlet_zip.ilike.${s},naics_code.ilike.${s}`
    )
  }
  if (filters.status) query = query.eq('status', filters.status)
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

  const { data: leads, count } = await query.range(from, to)
  const totalPages = Math.ceil((count ?? 0) / LEADS_PER_PAGE)

  // Check whether any leads exist at all (for empty-state messaging)
  const hasAnyLeads = (count ?? 0) > 0 || Object.values({
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
    .map(code => ({ code: code!, name: DFW_COUNTIES[code!] ?? code! }))
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
          {count != null && hasAnyLeads && (
            <p className="text-sm text-gray-500 mt-0.5">
              {count.toLocaleString()}{' '}
              {filters.hasPhone ? 'callable lead' : 'lead'}{count !== 1 ? 's' : ''}
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

      <div className="mb-4">
        <BulkEnrichBar />
      </div>

      {leads && leads.length > 0 ? (
        <>
          <LeadsTable leads={leads as Lead[]} />
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
