'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Lead } from '@/lib/types'
import { fmtDate, fmtPhone, STATUS_COLORS, PRIORITY_COLORS } from '@/lib/utils'
import {
  Star, Phone, Globe, Search, Settings2, Check, Loader2,
  CheckSquare, Square, FlaskConical, AlertCircle, X,
} from 'lucide-react'
import { EnrichmentBadge } from './EnrichmentBadge'

interface Props { leads: Lead[] }

type ColKey = 'score' | 'business' | 'city' | 'category' | 'permitDate' | 'firstSales' | 'phone' | 'status' | 'action'

const ALL_COLUMNS: { key: ColKey; label: string; always?: boolean }[] = [
  { key: 'score',      label: 'Score',       always: true },
  { key: 'business',   label: 'Business',    always: true },
  { key: 'city',       label: 'City' },
  { key: 'category',   label: 'Category' },
  { key: 'permitDate', label: 'Permit Date' },
  { key: 'firstSales', label: 'First Sales' },
  { key: 'phone',      label: 'Phone' },
  { key: 'status',     label: 'Status' },
  { key: 'action',     label: 'Action',      always: true },
]

const DEFAULT_COLS: ColKey[] = ['score', 'business', 'city', 'category', 'permitDate', 'firstSales', 'phone', 'status', 'action']
const MAX_SELECTION = 25

interface BulkResult {
  summary: { total: number; found: number; review: number; not_found: number; error: number; skipped: number }
}

export function LeadsTable({ leads }: Props) {
  const router = useRouter()
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))
  const [colMenuOpen, setColMenuOpen] = useState(false)

  // Row selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  const toggleCol = (key: ColKey) =>
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < MAX_SELECTION) {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selected.size > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(leads.slice(0, MAX_SELECTION).map(l => l.id)))
    }
  }, [selected.size, leads])

  async function runBulkResearch() {
    setShowBulkConfirm(false)
    setBulkLoading(true)
    setBulkResult(null)
    setBulkError(null)
    try {
      const res = await fetch('/api/enrich/find-contacts-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'selected', leadIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (!res.ok) setBulkError(data.error ?? 'Enrichment failed')
      else { setBulkResult(data); router.refresh() }
    } catch (e) {
      setBulkError(String(e))
    } finally {
      setBulkLoading(false)
      setSelected(new Set())
    }
  }

  const cols = ALL_COLUMNS.filter(c => visibleCols.has(c.key))
  const hasSelection = selected.size > 0

  return (
    <>
      {/* ── Selection + Bulk controls ── */}
      {(hasSelection || bulkResult || bulkError) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {hasSelection && (
            <>
              <span className="text-xs text-gray-600 font-medium">
                {selected.size} of {MAX_SELECTION} selected
              </span>
              <button
                onClick={() => setShowBulkConfirm(true)}
                disabled={bulkLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {bulkLoading ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                {bulkLoading ? 'Researching…' : `Research Selected (${selected.size})`}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1.5 rounded border border-gray-200"
              >
                <X size={10} /> Clear
              </button>
            </>
          )}

          {bulkResult && (
            <div className="flex items-center gap-3 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg flex-wrap">
              {bulkResult.summary.found > 0 && <span className="text-green-600 flex items-center gap-1"><Check size={11} /> {bulkResult.summary.found} found</span>}
              {bulkResult.summary.review > 0 && <span className="text-amber-600 flex items-center gap-1"><AlertCircle size={11} /> {bulkResult.summary.review} need review</span>}
              {bulkResult.summary.not_found > 0 && <span className="text-gray-400">{bulkResult.summary.not_found} not found</span>}
              {bulkResult.summary.error > 0 && <span className="text-red-500">{bulkResult.summary.error} errors</span>}
              <button onClick={() => setBulkResult(null)} className="text-gray-300 hover:text-gray-500 ml-1"><X size={10} /></button>
            </div>
          )}

          {bulkError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5 flex items-center gap-1.5">
              <AlertCircle size={11} /> {bulkError}
              <button onClick={() => setBulkError(null)}><X size={10} /></button>
            </div>
          )}
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-gray-900">Research {selected.size} leads?</h3>
            <p className="text-sm text-gray-600">
              This will search Google Places for {selected.size} selected lead{selected.size !== 1 ? 's' : ''}.
              Leads already enriched will be skipped.
            </p>
            <div className="flex gap-2">
              <button onClick={runBulkResearch} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors">
                Start Research
              </button>
              <button onClick={() => setShowBulkConfirm(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop table ── */}
      <div className="hidden md:block">
        <div className="flex justify-end mb-2 relative">
          <button
            onClick={() => setColMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white transition-colors"
          >
            <Settings2 size={12} /> Columns
          </button>
          {colMenuOpen && (
            <div className="absolute top-9 right-0 z-10 bg-white rounded-xl border border-gray-200 shadow-lg p-3 w-48 space-y-1">
              {ALL_COLUMNS.map(col => (
                <button
                  key={col.key}
                  disabled={col.always}
                  onClick={() => toggleCol(col.key)}
                  className="w-full flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default text-left"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${visibleCols.has(col.key) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                    {visibleCols.has(col.key) && <Check size={10} />}
                  </span>
                  {col.label}
                </button>
              ))}
              <button onClick={() => setColMenuOpen(false)} className="w-full text-xs text-gray-400 hover:text-gray-600 text-center pt-1">
                Close
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[36px]" /> {/* checkbox */}
              {cols.map(col => (
                <col key={col.key} className={
                  col.key === 'score'      ? 'w-[60px]'  :
                  col.key === 'city'       ? 'w-[90px]'  :
                  col.key === 'category'   ? 'w-[110px]' :
                  col.key === 'permitDate' ? 'w-[80px]'  :
                  col.key === 'firstSales' ? 'w-[80px]'  :
                  col.key === 'phone'      ? 'w-[120px]' :
                  col.key === 'status'     ? 'w-[100px]' :
                  col.key === 'action'     ? 'w-[80px]'  :
                  ''
                } />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-2 py-3">
                  <button onClick={toggleAll} className="flex items-center justify-center text-gray-400 hover:text-gray-700" title="Select all visible (max 25)">
                    {selected.size > 0 ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                  </button>
                </th>
                {cols.map(col => (
                  <th key={col.key} className="px-3 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {leads.map(lead => {
                const name = lead.display_name || lead.outlet_name || lead.taxpayer_name || '(Unnamed)'
                const isSelected = selected.has(lead.id)
                return (
                  <tr key={lead.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => toggleSelect(lead.id)}
                        disabled={!isSelected && selected.size >= MAX_SELECTION}
                        className="flex items-center justify-center text-gray-400 hover:text-blue-600 disabled:opacity-30"
                      >
                        {isSelected ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                      </button>
                    </td>
                    {cols.map(col => (
                      <td key={col.key} className="px-3 py-3 align-middle">
                        {col.key === 'score' && <ScoreCell score={lead.score} priority={lead.priority} />}
                        {col.key === 'business' && (
                          <div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {lead.starred && <Star size={11} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                              <Link
                                href={`/leads/${lead.id}`}
                                className="font-medium text-gray-900 hover:text-blue-600 leading-snug line-clamp-2 break-words"
                                title={name}
                              >
                                {name}
                              </Link>
                            </div>
                            <EnrichmentBadge
                              status={lead.enrichment_status}
                              confidence={(lead as Lead & { contact_match_confidence?: number | null }).contact_match_confidence}
                              className="mt-1"
                            />
                          </div>
                        )}
                        {col.key === 'city' && (
                          <span className="text-gray-600 text-xs leading-snug line-clamp-2 break-words">{lead.outlet_city}</span>
                        )}
                        {col.key === 'category' && (
                          lead.category === 'corporate_chain' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                              🏢 Corporate Chain
                            </span>
                          ) : (
                            <span className="text-gray-500 text-xs leading-snug line-clamp-2">
                              {lead.category || (lead.naics_code ? `NAICS ${lead.naics_code}` : '—')}
                            </span>
                          )
                        )}
                        {col.key === 'permitDate' && (
                          <span className="text-gray-600 text-xs whitespace-nowrap">{fmtDate(lead.permit_issue_date) || '—'}</span>
                        )}
                        {col.key === 'firstSales' && (
                          <span className={`text-xs whitespace-nowrap ${lead.first_sales_date && new Date(lead.first_sales_date) >= new Date() ? 'text-green-600 font-medium' : 'text-gray-600'}`}>
                            {lead.first_sales_date ? fmtDate(lead.first_sales_date) : '—'}
                          </span>
                        )}
                        {col.key === 'phone' && (() => {
                          const phone = lead.permit_phone ?? lead.primary_phone
                          return phone
                            ? (
                              <a href={`tel:${phone}`} className="text-blue-600 hover:underline flex items-center gap-1 text-xs whitespace-nowrap">
                                <Phone size={11} />{fmtPhone(phone)}
                                {lead.permit_phone && !lead.primary_phone && (
                                  <span className="text-[10px] text-gray-400">permit</span>
                                )}
                              </a>
                            )
                            : <span className="text-gray-300 text-xs">—</span>
                        })()}
                        {col.key === 'status' && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                            {lead.status.replace('_', ' ')}
                          </span>
                        )}
                        {col.key === 'action' && <ActionCell lead={lead} />}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards ── */}
      <div className="md:hidden space-y-2">
        {leads.map(lead => {
          const name = lead.display_name || lead.outlet_name || lead.taxpayer_name || '(Unnamed)'
          const isSelected = selected.has(lead.id)
          return (
            <div key={lead.id} className={`bg-white rounded-xl border p-4 ${isSelected ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200'}`}>
              <div className="flex items-start gap-2">
                <button onClick={() => toggleSelect(lead.id)} disabled={!isSelected && selected.size >= MAX_SELECTION}
                  className="mt-0.5 text-gray-400 hover:text-blue-600 shrink-0 disabled:opacity-30">
                  {isSelected ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                </button>
                <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {lead.starred && <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                      <Link href={`/leads/${lead.id}`} className="font-medium text-gray-900 text-sm leading-snug line-clamp-2 hover:text-blue-600" title={name}>
                        {name}
                      </Link>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-1">
                      {lead.outlet_city}
                      {lead.category === 'corporate_chain' && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                          🏢 Chain
                        </span>
                      )}
                    </p>
                    {lead.first_sales_date && (
                      <p className="text-xs text-gray-400 mt-0.5">Opens {fmtDate(lead.first_sales_date)}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <ScoreCell score={lead.score} priority={lead.priority} size="sm" />
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[lead.priority]}`}>{lead.priority}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                    {lead.status.replace('_', ' ')}
                  </span>
                  {(lead.permit_phone ?? lead.primary_phone) && (
                    <a href={`tel:${(lead.permit_phone ?? lead.primary_phone)!}`} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                      <Phone size={10} />{fmtPhone((lead.permit_phone ?? lead.primary_phone)!)}
                    </a>
                  )}
                  {!(lead.permit_phone ?? lead.primary_phone) && lead.website && (
                    <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1">
                      <Globe size={10} />Website
                    </a>
                  )}
                </div>
                <ActionCell lead={lead} />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function ScoreCell({ score, priority, size = 'default' }: { score: number; priority: string; size?: 'default' | 'sm' }) {
  const ring =
    priority === 'hot'  ? 'bg-red-500 text-white' :
    priority === 'good' ? 'bg-orange-400 text-white' :
    priority === 'low'  ? 'bg-gray-200 text-gray-700' :
                          'bg-gray-100 text-gray-500'
  const dim = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-9 h-9 text-sm'
  return (
    <span className={`${ring} ${dim} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {score}
    </span>
  )
}

function ActionCell({ lead }: { lead: Lead }) {
  const phone = lead.permit_phone ?? lead.primary_phone
  if (phone) {
    return (
      <a href={`tel:${phone}`}
        className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
        <Phone size={10} /> Call
      </a>
    )
  }
  return (
    <Link href={`/leads/${lead.id}`}
      className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
      <Search size={10} /> Find
    </Link>
  )
}
