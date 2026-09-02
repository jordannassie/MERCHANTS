'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback, useState, useRef } from 'react'
import type { LeadsFilters } from '@/lib/types'
import { LEAD_STATUSES, LEAD_PRIORITIES } from '@/lib/constants'
import { X, Search } from 'lucide-react'

interface Props {
  filters: LeadsFilters
  counties: { code: string; name: string }[]
}

export function LeadsFiltersBar({ filters, counties }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  // Local search state — keeps the input responsive while debouncing URL updates.
  const [searchValue, setSearchValue] = useState(filters.search || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // React-recommended pattern: store the previous URL value in state so we can
  // detect when it changes externally (e.g. "Clear filters") and reset the input.
  // Calling setState during render is safe when guarded by a changed-prop check.
  const [prevUrlSearch, setPrevUrlSearch] = useState(filters.search || '')
  const urlSearch = filters.search || ''
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch)
    setSearchValue(urlSearch)
  }

  const buildParams = useCallback(
    (updates: Partial<LeadsFilters>) => {
      const next = { ...filters, ...updates, page: 1 }
      const params = new URLSearchParams()
      if (next.search) params.set('search', next.search)
      if (next.status) params.set('status', next.status)
      if (next.priority) params.set('priority', next.priority)
      if (next.county) params.set('county', next.county)
      if (next.city) params.set('city', next.city)
      if (next.permitDateFrom) params.set('permitDateFrom', next.permitDateFrom)
      if (next.permitDateTo) params.set('permitDateTo', next.permitDateTo)
      if (next.firstSalesDateFrom) params.set('firstSalesDateFrom', next.firstSalesDateFrom)
      if (next.firstSalesDateTo) params.set('firstSalesDateTo', next.firstSalesDateTo)
      if (next.openingSoon) params.set('openingSoon', 'true')
      if (next.neverContacted) params.set('neverContacted', 'true')
      if (next.followUpDue) params.set('followUpDue', 'true')
      if (next.starred) params.set('starred', 'true')
      if (next.hasPhone) params.set('hasPhone', 'true')
      if (next.missingPhone) params.set('missingPhone', 'true')
      if (next.hasWebsite) params.set('hasWebsite', 'true')
      if (next.missingWebsite) params.set('missingWebsite', 'true')
      if (next.enriched) params.set('enriched', 'true')
      if (next.needsReview) params.set('needsReview', 'true')
      // showChains: set only when explicitly showing chains (default is hidden)
      if (next.hideCorporateChains === false) params.set('showChains', 'true')
      if (next.sort && next.sort !== 'score') params.set('sort', next.sort)
      if (next.order && next.order !== 'desc') params.set('order', next.order)
      return params
    },
    [filters]
  )

  const set = useCallback(
    (updates: Partial<LeadsFilters>) => {
      router.push(`${pathname}?${buildParams(updates).toString()}`)
    },
    [buildParams, pathname, router]
  )

  // Search: update local state immediately (keeps focus), debounce URL update
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      set({ search: value })
    }, 350)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current)
      set({ search: searchValue })
    }
  }

  const active = Boolean(
    filters.search || filters.status || filters.priority || filters.county ||
    filters.city || filters.permitDateFrom || filters.permitDateTo ||
    filters.firstSalesDateFrom || filters.firstSalesDateTo ||
    filters.openingSoon || filters.neverContacted || filters.followUpDue || filters.starred ||
    filters.hasPhone || filters.missingPhone || filters.hasWebsite || filters.missingWebsite ||
    filters.enriched || filters.needsReview || !filters.hideCorporateChains
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 space-y-3">
      {/* Search — uses local state so typing never loses focus */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by name, phone, city, ZIP, NAICS…"
          value={searchValue}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Search leads"
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filters.status || ''}
          onChange={e => set({ status: e.target.value as LeadsFilters['status'] })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          value={filters.priority || ''}
          onChange={e => set({ priority: e.target.value as LeadsFilters['priority'] })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          {LEAD_PRIORITIES.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

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

        <select
          value={filters.sort || 'score'}
          onChange={e => set({ sort: e.target.value as LeadsFilters['sort'] })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          aria-label="Sort by"
        >
          <option value="score">Sort: Score</option>
          <option value="permit_issue_date">Sort: Permit Date</option>
          <option value="first_sales_date">Sort: First Sales</option>
          <option value="next_follow_up_at">Sort: Follow-up</option>
          <option value="created_at">Sort: Added</option>
        </select>
      </div>

      {/* Permit date range */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500">Permit date:</span>
        <input
          type="date"
          value={filters.permitDateFrom || ''}
          onChange={e => set({ permitDateFrom: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Permit date from"
        />
        <span className="text-xs text-gray-400">to</span>
        <input
          type="date"
          value={filters.permitDateTo || ''}
          onChange={e => set({ permitDateTo: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Permit date to"
        />

        <span className="text-xs text-gray-500 ml-2">First sales:</span>
        <input
          type="date"
          value={filters.firstSalesDateFrom || ''}
          onChange={e => set({ firstSalesDateFrom: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="First sales from"
        />
        <span className="text-xs text-gray-400">to</span>
        <input
          type="date"
          value={filters.firstSalesDateTo || ''}
          onChange={e => set({ firstSalesDateTo: e.target.value })}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="First sales to"
        />
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'openingSoon' as const, label: 'Opening soon' },
          { key: 'neverContacted' as const, label: 'Never contacted' },
          { key: 'followUpDue' as const, label: 'Follow-up due' },
          { key: 'starred' as const, label: '⭐ Starred' },
          { key: 'hasPhone' as const, label: '📞 Has phone' },
          { key: 'missingPhone' as const, label: 'Missing phone' },
          { key: 'hasWebsite' as const, label: '🌐 Has website' },
          { key: 'missingWebsite' as const, label: 'Missing website' },
          { key: 'enriched' as const, label: '✓ Contact found' },
          { key: 'needsReview' as const, label: '⚑ Needs review' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => set({ [key]: !filters[key] })}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              filters[key]
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            {label}
          </button>
        ))}

        {/* Corporate chain toggle — chains are hidden by default */}
        <button
          onClick={() => set({ hideCorporateChains: !filters.hideCorporateChains })}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            filters.hideCorporateChains === false
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
          }`}
          title="Corporate chains (Chipotle, McDonald's, etc.) are hidden by default — payment decisions are made centrally"
        >
          {filters.hideCorporateChains === false ? '🏢 Chains visible' : '🏢 Show chains'}
        </button>

        {active && (
          <button
            onClick={() => {
              clearTimeout(debounceRef.current)
              router.push(pathname)
            }}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 flex items-center gap-1"
          >
            <X size={10} /> Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
