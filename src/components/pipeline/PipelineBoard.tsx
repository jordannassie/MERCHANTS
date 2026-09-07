'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Lead } from '@/lib/types'
import { Phone } from 'lucide-react'
import { PipelineColumn } from './PipelineColumn'

// Active pipeline stages (Desktop Kanban)
const DESKTOP_STAGES = ['attempted', 'connected', 'agreement_requested', 'won']

// Closed stages
const CLOSED_STAGES = ['lost', 'do_not_contact']

// Mobile stage-tab bar
const MOBILE_STAGES_ACTIVE = ['attempted', 'connected', 'agreement_requested', 'won']
const MOBILE_STAGES_CLOSED = ['lost', 'do_not_contact']

const STAGE_LABELS: Record<string, string> = {
  attempted:            'CONTACTED',
  connected:            'REPLIED',
  agreement_requested:  'AGREEMENT',
  won:                  'WON',
  lost:                 'Lost',
  do_not_contact:       'DNC',
}

interface Props {
  byStatus: Record<string, Lead[]>
  hasPhone: boolean
  activeStage: string
  totalCount: number
  callableCount: number
}

export function PipelineBoard({
  byStatus,
  hasPhone,
  activeStage,
  totalCount,
  callableCount,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [cityFilter, setCityFilter] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  const desktopStages = showClosed ? CLOSED_STAGES : DESKTOP_STAGES
  const mobileStages = showClosed ? MOBILE_STAGES_CLOSED : MOBILE_STAGES_ACTIVE

  // Collect unique cities from all pipeline leads for the location filter
  const allLeads = useMemo(() => Object.values(byStatus).flat(), [byStatus])
  const cities = useMemo(() => {
    const set = new Set<string>()
    allLeads.forEach(l => {
      if (l.outlet_city) set.add(l.outlet_city)
    })
    return Array.from(set).sort()
  }, [allLeads])

  function buildUrl(overrides: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function setStage(stage: string) {
    router.push(buildUrl({ stage }))
  }

  function setHasPhone(value: boolean) {
    router.push(buildUrl({ hasPhone: value ? null : 'false' }))
  }

  function applyCity(leads: Lead[]) {
    if (!cityFilter) return leads
    return leads.filter(l => l.outlet_city === cityFilter)
  }

  const mobileLeads = applyCity(byStatus[activeStage] ?? [])

  function stageCount(stage: string) {
    const leads = byStatus[stage] ?? []
    return cityFilter ? leads.filter(l => l.outlet_city === cityFilter).length : leads.length
  }

  const currentMobileStages = mobileStages

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          MOBILE LAYOUT
          ═══════════════════════════════════════════════════════════ */}
      <div className="md:hidden">
        {/* Active / Closed toggle */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setShowClosed(false)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              !showClosed ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setShowClosed(true)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              showClosed ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            Closed
          </button>
        </div>

        {/* Compact filter row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {cities.length > 0 && (
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[130px] truncate"
              aria-label="Filter by city"
            >
              <option value="">All cities</option>
              {cities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setHasPhone(!hasPhone)}
            className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              hasPhone
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            <Phone size={10} />
            {hasPhone ? 'Has phone' : 'Show all'}
          </button>
        </div>

        {/* Stage tab bar */}
        <div className="sticky top-0 z-20 bg-white -mx-4 px-4 border-b border-gray-100">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide py-2">
            {currentMobileStages.map(stage => {
              const count = stageCount(stage)
              const isActive = activeStage === stage
              return (
                <button
                  key={stage}
                  onClick={() => setStage(stage)}
                  className={`shrink-0 inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {STAGE_LABELS[stage]}
                  <span className={`text-[10px] font-bold ${isActive ? 'opacity-90' : 'text-gray-400'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4">
          <PipelineColumn
            status={activeStage}
            label={STAGE_LABELS[activeStage] ?? activeStage}
            leads={mobileLeads}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DESKTOP LAYOUT — horizontal-scroll Kanban
          ═══════════════════════════════════════════════════════════ */}
      <div className="hidden md:block">
        {/* Desktop filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Active / Closed toggle */}
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => setShowClosed(false)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                !showClosed ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setShowClosed(true)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                showClosed ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              Closed
            </button>
          </div>

          <span className="text-xs text-gray-300">|</span>

          <button
            onClick={() => setHasPhone(true)}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              hasPhone
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            <Phone size={11} /> Has phone
            {hasPhone && (
              <span className="ml-0.5 bg-white/20 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                {callableCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setHasPhone(false)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              !hasPhone
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
            }`}
          >
            Show all{!hasPhone && <span className="ml-1 opacity-75">({totalCount})</span>}
          </button>
          <span className="text-xs text-gray-400 ml-auto">
            {hasPhone ? callableCount : totalCount} lead
            {(hasPhone ? callableCount : totalCount) !== 1 ? 's' : ''} across pipeline
          </span>
        </div>

        {/* Kanban board */}
        <div className="overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {desktopStages.map(status => (
              <PipelineColumn
                key={status}
                status={status}
                label={STAGE_LABELS[status] ?? status}
                leads={byStatus[status] ?? []}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
