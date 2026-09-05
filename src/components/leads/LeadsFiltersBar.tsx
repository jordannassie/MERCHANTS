'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useState, useRef } from 'react'
import type { LeadsFilters } from '@/lib/types'
import { LEAD_STATUSES } from '@/lib/constants'
import { X, Search } from 'lucide-react'

interface Props {
  filters: LeadsFilters
  counties: { code: string; name: string }[]
}

// Pipeline status buttons — order and labels shown in the filter bar
const STATUS_BUTTONS = [
  { value: 'new',            label: 'New' },
  { value: 'attempted',      label: 'Attempted' },
  { value: 'connected',      label: 'Connected' },
  { value: 'follow_up',      label: 'Follow-up' },
  { value: 'appointment',    label: 'Appointment' },
  { value: 'won',            label: 'Won' },
  { value: 'lost',           label: 'Lost' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
  { value: 'all',            label: 'All' },
] as const

const REGIONS = ['DFW', 'Houston', 'Austin', 'San Antonio', 'All Texas'] as const

export function LeadsFiltersBar({ filters, counties }: Props) {
  const router  = useRouter()
  const pathname = usePathname()

  // Local search state keeps the input responsive while URL is debounced
  const [searchValue, setSearchValue]   = useState(filters.search || '')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Sync input with external URL changes (e.g. clear button)
  const [prevUrlSearch, setPrevUrlSearch] = useState(filters.search || '')
  const urlSearch = filters.search || ''
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch)
    setSearchValue(urlSearch)
  }

  // The active status from URL — 'new' is the default when param is absent
  const activeStatus = (filters.status as string) || 'new'

  // ── Build URLSearchParams from current filters + any overrides ────────────
  const buildParams = useCallback(
    (updates: Record<string, unknown>) => {
      const next = { ...filters, ...updates, page: 1 }
      const params = new URLSearchParams()

      if (next.region)     params.set('region', next.region as string)
      if (next.leadSource) params.set('leadSource', next.leadSource as string)
      if (next.search)     params.set('search', next.search as string)

      // Status: always write it explicitly so the URL is the single source of truth
      const st = (next.status ?? 'new') as string
      params.set('status', st)

      if (next.priority)          params.set('priority', next.priority as string)
      if (next.county)            params.set('county', next.county as string)
      if (next.city)              params.set('city', next.city as string)
      if (next.permitDateFrom)    params.set('permitDateFrom', next.permitDateFrom as string)
      if (next.permitDateTo)      params.set('permitDateTo', next.permitDateTo as string)
      if (next.firstSalesDateFrom) params.set('firstSalesDateFrom', next.firstSalesDateFrom as string)
      if (next.firstSalesDateTo)  params.set('firstSalesDateTo', next.firstSalesDateTo as string)
      if (next.openingSoon)       params.set('openingSoon', 'true')
      if (next.neverContacted)    params.set('neverContacted', 'true')
      if (next.followUpDue)       params.set('followUpDue', 'true')
      if (next.starred)           params.set('starred', 'true')
      if ((next.hasPhone as boolean) === false) params.set('hasPhone', 'false')
      if (next.missingPhone)      params.set('missingPhone', 'true')
      if (next.hasWebsite)        params.set('hasWebsite', 'true')
      if (next.missingWebsite)    params.set('missingWebsite', 'true')
      if (next.enriched)          params.set('enriched', 'true')
      if (next.needsReview)       params.set('needsReview', 'true')
      // hideCorporateChains is opt-in now (default false = show all leads)
      // Only write the param when hiding chains is explicitly enabled
      if ((next.hideCorporateChains as boolean) === true) params.set('showChains', 'false')
      if (next.sort && next.sort !== 'score') params.set('sort', next.sort as string)
      if (next.order && next.order !== 'desc') params.set('order', next.order as string)

      return params
    },
    [filters]
  )

  const set = useCallback(
    (updates: Record<string, unknown>) => {
      router.push(`${pathname}?${buildParams(updates).toString()}`)
    },
    [buildParams, pathname, router]
  )

  // ── Search handlers ───────────────────────────────────────────────────────
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // When search is non-empty, show across all statuses so nothing is hidden
      set({ search: value, status: value ? 'all' : activeStatus })
    }, 350)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current)
      set({ search: searchValue, status: searchValue ? 'all' : activeStatus })
    }
  }

  const clearSearch = () => {
    clearTimeout(debounceRef.current)
    setSearchValue('')
    set({ search: '', status: 'new' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-3">

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by name, phone, city, ZIP…"
          value={searchValue}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Search leads"
        />
        {searchValue && (
          <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Region quick-select */}
      <div className="flex flex-wrap gap-2">
        {REGIONS.map(r => (
          <button
            key={r}
            onClick={() => set({ region: r, county: '' })}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${
              filters.region === r
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Lead Source filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 font-medium">Source:</span>
        {([
          { value: '',       label: 'All Sources' },
          { value: 'state',  label: '🏛 State' },
          { value: 'google', label: '📍 Google' },
          { value: 'both',   label: '🔗 Both' },
        ] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => set({ leadSource: value })}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              (filters.leadSource ?? '') === value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Pipeline status buttons — one source of truth ── */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5 font-medium">Pipeline</p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_BUTTONS.map(({ value, label }) => {
            const isActive = activeStatus === value
            return (
              <button
                key={value}
                onClick={() => set({ status: value })}
                className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* County + City + More Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {counties.length > 0 && (
          <select
            value={filters.county || ''}
            onChange={e => set({ county: e.target.value })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            aria-label="Filter by county"
          >
            <option value="">All counties</option>
            {counties.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        )}

        <input
          type="text"
          placeholder="City"
          value={filters.city || ''}
          onChange={e => set({ city: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filter by city"
        />

        <button
          onClick={() => setShowAdvanced(s => !s)}
          className="text-sm text-gray-600 px-3 py-1 rounded border border-gray-200 hover:bg-gray-50"
        >
          {showAdvanced ? 'Hide filters' : 'More Filters'}
        </button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">Permit date:</span>
            <input type="date" value={filters.permitDateFrom || ''} onChange={e => set({ permitDateFrom: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={filters.permitDateTo || ''} onChange={e => set({ permitDateTo: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1" />
            <span className="text-xs text-gray-500 ml-2">First sales:</span>
            <input type="date" value={filters.firstSalesDateFrom || ''} onChange={e => set({ firstSalesDateFrom: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={filters.firstSalesDateTo || ''} onChange={e => set({ firstSalesDateTo: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1" />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'openingSoon'   as const, label: 'Opening soon' },
              { key: 'neverContacted' as const, label: 'Never contacted' },
              { key: 'followUpDue'   as const, label: 'Follow-up due' },
              { key: 'starred'       as const, label: '⭐ Starred' },
              { key: 'hasPhone'      as const, label: '📞 Has phone' },
              { key: 'missingPhone'  as const, label: 'Missing phone' },
              { key: 'hasWebsite'    as const, label: '🌐 Has website' },
              { key: 'missingWebsite' as const, label: 'Missing website' },
              { key: 'enriched'      as const, label: '✓ Contact found' },
              { key: 'needsReview'   as const, label: '⚑ Needs review' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => set({ [key]: !filters[key] })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filters[key] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <button
              onClick={() => { clearTimeout(debounceRef.current); router.push(pathname) }}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 flex items-center gap-1"
            >
              <X size={10} /> Clear all filters
            </button>
          </div>
        </>
      )}
    </div>
  )
}
