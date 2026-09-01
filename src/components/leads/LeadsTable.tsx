'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lead } from '@/lib/types'
import { fmtDate, fmtPhone, STATUS_COLORS, PRIORITY_COLORS } from '@/lib/utils'
import { Star, Phone, Globe, Search, Settings2, Check } from 'lucide-react'
import { EnrichmentBadge } from './EnrichmentBadge'

interface Props { leads: Lead[] }

type ColKey =
  | 'score' | 'business' | 'city' | 'category'
  | 'permitDate' | 'firstSales' | 'phone' | 'status' | 'action'

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

const DEFAULT_COLS: ColKey[] = [
  'score', 'business', 'city', 'category', 'permitDate', 'firstSales', 'phone', 'status', 'action',
]

export function LeadsTable({ leads }: Props) {
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))
  const [colMenuOpen, setColMenuOpen] = useState(false)

  function toggleCol(key: ColKey) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const cols = ALL_COLUMNS.filter(c => visibleCols.has(c.key))

  return (
    <>
      {/* ── Desktop table ──────────────────────────────────────────────── */}
      <div className="hidden md:block">
        {/* Column picker */}
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
              <button
                onClick={() => { setColMenuOpen(false) }}
                className="w-full text-xs text-gray-400 hover:text-gray-600 text-center pt-1"
              >
                Close
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
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
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
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
                              >
                                {name}
                              </Link>
                            </div>
                            <EnrichmentBadge
                              status={lead.enrichment_status}
                              confidence={lead.contact_match_confidence}
                              className="mt-1"
                            />
                          </div>
                        )}
                        {col.key === 'city' && (
                          <span className="text-gray-600 text-xs leading-snug line-clamp-2 break-words">
                            {lead.outlet_city}
                          </span>
                        )}
                        {col.key === 'category' && (
                          <span className="text-gray-500 text-xs leading-snug line-clamp-2">
                            {lead.category || (lead.naics_code ? `NAICS ${lead.naics_code}` : '—')}
                          </span>
                        )}
                        {col.key === 'permitDate' && (
                          <span className="text-gray-600 text-xs whitespace-nowrap">
                            {fmtDate(lead.permit_issue_date) || '—'}
                          </span>
                        )}
                        {col.key === 'firstSales' && (
                          <span className={`text-xs whitespace-nowrap ${lead.first_sales_date && new Date(lead.first_sales_date) >= new Date() ? 'text-green-600 font-medium' : 'text-gray-600'}`}>
                            {lead.first_sales_date ? fmtDate(lead.first_sales_date) : '—'}
                          </span>
                        )}
                        {col.key === 'phone' && (
                          lead.primary_phone ? (
                            <a href={`tel:${lead.primary_phone}`} className="text-blue-600 hover:underline flex items-center gap-1 text-xs whitespace-nowrap">
                              <Phone size={11} />{fmtPhone(lead.primary_phone)}
                            </a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )
                        )}
                        {col.key === 'status' && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                            {lead.status.replace('_', ' ')}
                          </span>
                        )}
                        {col.key === 'action' && (
                          <ActionCell lead={lead} />
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards ───────────────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {leads.map(lead => {
          const name = lead.display_name || lead.outlet_name || lead.taxpayer_name || '(Unnamed)'
          return (
            <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {lead.starred && <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                    <Link href={`/leads/${lead.id}`} className="font-medium text-gray-900 text-sm leading-snug line-clamp-2 break-words hover:text-blue-600">
                      {name}
                    </Link>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {lead.outlet_city}{lead.category ? ` · ${lead.category}` : ''}
                  </p>
                  {lead.first_sales_date && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Opens {fmtDate(lead.first_sales_date)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <ScoreCell score={lead.score} priority={lead.priority} size="sm" />
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[lead.priority]}`}>
                    {lead.priority}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>
                    {lead.status.replace('_', ' ')}
                  </span>
                  {lead.primary_phone && (
                    <a href={`tel:${lead.primary_phone}`} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                      <Phone size={10} />{fmtPhone(lead.primary_phone)}
                    </a>
                  )}
                  {!lead.primary_phone && lead.website && (
                    <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1">
                      <Globe size={10} />Website
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {lead.primary_phone ? (
                    <a href={`tel:${lead.primary_phone}`}
                      className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors">
                      <Phone size={10} /> Call
                    </a>
                  ) : (
                    <Link href={`/leads/${lead.id}`}
                      className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors">
                      <Search size={10} /> Find
                    </Link>
                  )}
                </div>
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
  if (lead.primary_phone) {
    return (
      <a
        href={`tel:${lead.primary_phone}`}
        className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        <Phone size={10} /> Call
      </a>
    )
  }
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
    >
      <Search size={10} /> Find
    </Link>
  )
}
