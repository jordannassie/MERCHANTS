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
import { LEAD_STATUSES, COUNTY_NAMES } from '@/lib/constants'
import type { LeadStatus } from '@/lib/types'
// Enrichment UI removed from default simplified outreach view

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

const DEFAULT_COLS: ColKey[] = ['business', 'phone', 'city', 'permitDate', 'firstSales', 'status', 'action']
const MAX_SELECTION = 25

interface BulkResult {
  summary: { total: number; found: number; review: number; not_found: number; error: number; skipped: number }
}

export function LeadsTable({ leads }: Props) {
  const router = useRouter()
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const currentStatusParam = searchParams?.get('status') || 'new'
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(DEFAULT_COLS))
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [leadsList, setLeadsList] = useState<Lead[]>(leads)

  // per-row copy state and toasts
  const [phoneCopied, setPhoneCopied] = useState<Record<string, boolean>>({})
  const [smsCopied, setSmsCopied] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; kind: 'phone' | 'sms' | 'error' }>>([])

  function addToast(id: string, text: string, kind: 'phone' | 'sms' | 'error') {
    const t = { id: `${Date.now()}-${id}`, text, kind }
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 1600)
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch (e) { /* fallthrough */ }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

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
        <div className="grid grid-cols-1 gap-3">
          {leadsList.map(lead => {
            const name = lead.display_name || lead.outlet_name || lead.taxpayer_name || '(Unnamed)'
            const city = lead.outlet_city || ''
            const county = COUNTY_NAMES[String(lead.outlet_county_code || '')] || lead.outlet_county_code || ''
            const phone = lead.permit_phone ?? lead.primary_phone
            const normalized = phone ? phone.replace(/\D/g, '') : ''
            const sms = (lead.display_name || lead.outlet_name)
              ? `Hi, this is Jordan with Process.Direct. I saw that ${lead.display_name || lead.outlet_name} is getting set up in Texas. Have you already gotten your card processing/POS set up?`
              : `Hi, this is Jordan with Process.Direct. I saw that your business is getting set up in Texas. Have you already gotten your card processing/POS set up?`
            return (
              <div key={lead.id} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-start md:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/leads/${lead.id}`} className="font-medium text-gray-900 text-lg leading-tight hover:text-blue-600 line-clamp-2">
                        {name}
                      </Link>
                      <div className="text-sm text-gray-600 mt-1">
                        {city}{city && county ? ', ' : ''}{county}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div>
                        <div className="text-xs text-gray-500">Permit</div>
                        <div className="text-sm text-gray-700 whitespace-nowrap">{fmtDate(lead.permit_issue_date) || '—'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">First Sales</div>
                        <div className="text-sm text-gray-700 whitespace-nowrap">{lead.first_sales_date ? fmtDate(lead.first_sales_date) : '—'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="md:col-span-1">
                      <div className="text-xs text-gray-500">Phone</div>
                      {phone ? (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={async () => {
                              const ok = await copyToClipboard(normalized)
                              if (ok) {
                                setPhoneCopied(s => ({ ...s, [lead.id]: true }))
                                addToast(lead.id, 'Phone copied', 'phone')
                                setTimeout(() => setPhoneCopied(s => ({ ...s, [lead.id]: false })), 1800)
                              } else {
                                addToast(lead.id, 'Could not copy — try again', 'error')
                              }
                            }}
                            className={`text-sm font-medium px-3 py-1 border rounded ${phoneCopied[lead.id] ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-blue-600 border-gray-200'}`}
                          >
                            {phoneCopied[lead.id] ? '✓ Copied!' : fmtPhone(phone)}
                          </button>
                          <a href={`tel:${phone}`} className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded">Call</a>
                        </div>
                      ) : <div className="text-sm text-gray-400">—</div>}
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-xs text-gray-500">Message</div>
                      <div className="mt-1 bg-gray-50 px-3 py-2 rounded text-sm leading-relaxed text-slate-800">
                        {sms}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={async () => {
                            const ok = await copyToClipboard(sms)
                            if (ok) {
                              setSmsCopied(s => ({ ...s, [lead.id]: true }))
                              addToast(lead.id, 'SMS message copied', 'sms')
                              setTimeout(() => setSmsCopied(s => ({ ...s, [lead.id]: false })), 1800)
                            } else {
                              addToast(lead.id, 'Could not copy — try again', 'error')
                            }
                          }}
                          className={`text-sm px-3 py-1 rounded border ${smsCopied[lead.id] ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white border-gray-200'}`}
                        >
                          {smsCopied[lead.id] ? '✓ Copied!' : 'Copy Message'}
                        </button>

                        <div className="ml-auto md:ml-0">
                          <StatusDropdown lead={lead} onStatusChange={async (newStatus) => {
                            const res = await fetch(`/api/leads/${lead.id}/status`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: newStatus }),
                            })
                            if (res.ok) {
                              const currentStatus = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search).get('status') || 'new' : 'new'
                              if (newStatus !== currentStatus) {
                                setLeadsList(prev => {
                                  const idxLocal = prev.findIndex(p => p.id === lead.id)
                                  const next = prev.filter(p => p.id !== lead.id)
                                  setTimeout(() => {
                                    try {
                                      const container = document.querySelector('div.grid.grid-cols-1')
                                      if (container) {
                                        const cards = Array.from(container.querySelectorAll('div.bg-white.border'))
                                        const target = cards[idxLocal] || cards[idxLocal - 1] || cards[0]
                                        if (target) {
                                          target.classList.add('ring-2', 'ring-blue-300')
                                          setTimeout(() => target.classList.remove('ring-2', 'ring-blue-300'), 900)
                                          target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                                        }
                                      }
                                    } catch (e) { /* noop */ }
                                  }, 120)
                                  return next
                                })
                              } else {
                                setLeadsList(prev => prev.map(p => p.id === lead.id ? { ...p, status: newStatus as LeadStatus } : p))
                              }
                            } else {
                              addToast(lead.id, 'Failed to update status', 'error')
                            }
                          }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
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
                    <p className="text-sm text-gray-600 mt-0.5">{lead.outlet_city}{lead.outlet_county_code ? `, ${lead.outlet_county_code}` : ''}</p>
                    {lead.first_sales_date && (
                      <p className="text-xs text-gray-400 mt-0.5">Opens {fmtDate(lead.first_sales_date)}</p>
                    )}
                  </div>
                  {/* priority/score removed from simplified outreach row */}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50 gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                          <StatusDropdown lead={lead} onStatusChange={async (newStatus: LeadStatus) => {
                    // call API and remove row if needed
                    const res = await fetch(`/api/leads/${lead.id}/status`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: newStatus }),
                    })
                    if (res.ok) {
                      const currentStatus = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search).get('status') || 'new' : 'new'
                              if (newStatus !== currentStatus) {
                                // Auto-advance: remove the row and keep scroll position, then highlight next row
                                setLeadsList(prev => {
                                  const idx = prev.findIndex(p => p.id === lead.id)
                                  const next = prev.filter(p => p.id !== lead.id)
                                  // schedule DOM highlight in next tick
                                  setTimeout(() => {
                                    try {
                                      const table = document.querySelector('table.w-full')
                                      if (table) {
                                        const tbody = table.querySelector('tbody')
                                        if (tbody) {
                                          // restore scroll top to previous container if necessary (no jump)
                                          // highlight the row that took this row's position
                                          const rows = Array.from(tbody.querySelectorAll('tr'))
                                          const target = rows[idx] || rows[idx - 1] || rows[0]
                                          if (target) {
                                            target.classList.add('ring-2', 'ring-blue-300')
                                            setTimeout(() => target.classList.remove('ring-2', 'ring-blue-300'), 900)
                                            // ensure the target is in view but do not jump to top
                                            target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                                          }
                                        }
                                      }
                                    } catch (e) { /* noop */ }
                                  }, 100)
                                  return next
                                })
                              } else {
                                setLeadsList(prev => prev.map(p => p.id === lead.id ? { ...p, status: newStatus as LeadStatus } : p))
                              }
                    }
                  }} />
                  {(lead.permit_phone ?? lead.primary_phone) && (() => {
                    const phone = (lead.permit_phone ?? lead.primary_phone)!
                    const normalized = phone.replace(/\D/g, '')
                    return (
                      <button onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(normalized)
                          const el = document.createElement('span')
                          el.textContent = 'Copied ✓'
                          el.className = 'ml-2 text-xs text-green-600'
                          const parent = document.getElementById(`mobile-phone-copy-${lead.id}`)
                          if (parent) {
                            parent.appendChild(el)
                            setTimeout(() => el.remove(), 1200)
                          }
                        } catch {}
                      }} id={`mobile-phone-copy-${lead.id}`} className="text-xs text-blue-600 flex items-center gap-1">
                        <Phone size={10} />{fmtPhone(phone)}
                      </button>
                    )
                  })()}
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
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto px-3 py-2 rounded-lg text-sm ${t.kind === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            <span className="inline-flex items-center gap-2">{t.kind !== 'error' ? '✓' : '⚠'} {t.text}</span>
          </div>
        ))}
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
    const normalized = phone.replace(/\D/g, '')
    const business = lead.display_name || lead.outlet_name || ''
    const smsMessage = business
      ? `Hi, this is Jordan with Process.Direct. I saw that ${business} is getting set up in Texas. Have you already gotten your card processing/POS set up?`
      : `Hi, this is Jordan with Process.Direct. I saw that your business is getting set up in Texas. Have you already gotten your card processing/POS set up?`
    return (
      <div className="flex items-center gap-2">
        <a href={`tel:${phone}`}
          className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
          <Phone size={10} /> Call
        </a>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(normalized)
              // show transient feedback
              const el = document.createElement('span')
              el.textContent = 'Copied ✓'
              el.className = 'ml-2 text-xs text-green-600'
              // insert near button
              const btn = document.getElementById(`copy-sms-${lead.id}`)
              if (btn?.parentElement) {
                btn.parentElement.appendChild(el)
                setTimeout(() => el.remove(), 1200)
              }
            } catch {}
          }}
          id={`copy-sms-${lead.id}`}
          className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-2 py-1.5 rounded-lg transition-colors"
          title="Copy SMS message"
        >
          Copy SMS
        </button>
      </div>
    )
  }
  return (
    <Link href={`/leads/${lead.id}`}
      className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
      <Search size={10} /> Find
    </Link>
  )
}

function StatusDropdown({ lead, onStatusChange }: { lead: Lead; onStatusChange: (s: LeadStatus) => Promise<void> }) {
  const [value, setValue] = useState<LeadStatus>(lead.status)
  const [loading, setLoading] = useState(false)
  return (
    <select
      value={value}
      onChange={async (e) => {
        const v = e.target.value as LeadStatus
        setValue(v)
        setLoading(true)
        await onStatusChange(v)
        setLoading(false)
      }}
      className="text-xs rounded px-2 py-1 border border-gray-200"
    >
      <option value="new">New</option>
      {LEAD_STATUSES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  )
}
