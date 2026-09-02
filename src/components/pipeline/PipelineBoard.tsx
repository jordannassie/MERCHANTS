'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Lead } from '@/lib/types'
import { Phone } from 'lucide-react'
import { PipelineColumn } from './PipelineColumn'

// Desktop Kanban columns (matches original behaviour)
const DESKTOP_STAGES = ['new', 'attempted', 'connected', 'follow_up', 'appointment', 'won']

// Mobile stage-tab bar includes Lost
const MOBILE_STAGES = ['new', 'attempted', 'connected', 'follow_up', 'appointment', 'won', 'lost']

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  attempted: 'Attempted',
  connected: 'Connected',
  follow_up: 'Follow-up',
  appointment: 'Appt',
  won: 'Won',
  lost: 'Lost',
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
    // hasPhone defaults to true — only encode when false
    router.push(buildUrl({ hasPhone: value ? null : 'false' }))
  }

  // City filter applied client-side to the active stage's leads
  function applyCity(leads: Lead[]) {
    if (!cityFilter) return leads
    return leads.filter(l => l.outlet_city === cityFilter)
  }

  const mobileLeads = applyCity(byStatus[activeStage] ?? [])

  // Per-stage counts (respecting city filter for mobile display only)
  function stageCount(stage: string) {
    const leads = byStatus[stage] ?? []
    return cityFilter ? leads.filter(l => l.outlet_city === cityFilter).length : leads.length
  }

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          MOBILE LAYOUT
          ═══════════════════════════════════════════════════════════ */}
      <div className="md:hidden">
        {/* Compact filter row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {/* Location / city filter */}
          {cities.length > 0 && (
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[130px] truncate"
              aria-label="Filter by city"
            >
              <option value="">All cities</option>
              {cities.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Has phone toggle */}
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

        {/* Stage tab bar — sticky, horizontal scroll, no scrollbar */}
        <div className="sticky top-0 z-20 bg-white -mx-4 px-4 border-b border-gray-100">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide py-2">
            {MOBILE_STAGES.map(stage => {
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
                  <span
                    className={`text-[10px] font-bold ${isActive ? 'opacity-90' : 'text-gray-400'}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Single full-width column for the active stage */}
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
          <span className="text-xs text-gray-500 font-medium mr-1">Show:</span>
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

        {/* Kanban board — constrained width, horizontal scroll */}
        <div className="overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            {DESKTOP_STAGES.map(status => (
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
