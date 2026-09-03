'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lead } from '@/lib/types'
import { fmtDate, fmtPhone } from '@/lib/utils'
import { Phone } from 'lucide-react'
import { LEAD_STATUSES, COUNTY_NAMES } from '@/lib/constants'
import type { LeadStatus } from '@/lib/types'

interface Props { leads: Lead[] }

export function LeadsTable({ leads }: Props) {
  const [leadsList, setLeadsList] = useState<Lead[]>(leads)
  const [phoneCopied, setPhoneCopied] = useState<Record<string, boolean>>({})
  const [smsCopied, setSmsCopied] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; kind: 'success' | 'error' }>>([])

  function addToast(id: string, text: string, kind: 'success' | 'error') {
    const t = { id: `${Date.now()}-${id}`, text, kind }
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 1800)
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {}
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  async function handleStatusChange(lead: Lead, newStatus: LeadStatus) {
    const res = await fetch(`/api/leads/${lead.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      addToast(lead.id, 'Failed to save status', 'error')
      return
    }
    const currentStatus =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('status') || 'new'
        : 'new'
    if (newStatus !== currentStatus && currentStatus !== 'all') {
      // Remove card from current queue and highlight the next one
      setLeadsList(prev => {
        const idx = prev.findIndex(p => p.id === lead.id)
        const next = prev.filter(p => p.id !== lead.id)
        setTimeout(() => {
          try {
            const container = document.querySelector('[data-leads-container]')
            if (container) {
              const cards = Array.from(container.querySelectorAll('[data-lead-card]')) as HTMLElement[]
              const target = cards[idx] ?? cards[idx - 1] ?? cards[0]
              if (target) {
                target.classList.add('ring-2', 'ring-blue-300', 'ring-offset-1')
                setTimeout(() => target.classList.remove('ring-2', 'ring-blue-300', 'ring-offset-1'), 900)
                target.scrollIntoView({ block: 'nearest' })
              }
            }
          } catch {}
        }, 80)
        return next
      })
    } else {
      setLeadsList(prev =>
        prev.map(p => p.id === lead.id ? { ...p, status: newStatus } : p)
      )
    }
  }

  if (leadsList.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
        <p className="text-gray-500 font-medium">Queue is empty</p>
        <p className="text-sm text-gray-400 mt-1">All done here — switch the Pipeline filter to see other leads.</p>
      </div>
    )
  }

  return (
    <>
      {/* Lead cards — shared layout for desktop and mobile */}
      <div className="grid grid-cols-1 gap-3" data-leads-container>
        {leadsList.map(lead => {
          const name = lead.display_name || lead.outlet_name || lead.taxpayer_name || '(Unnamed)'
          const city = lead.outlet_city || ''
          const county = COUNTY_NAMES[String(lead.outlet_county_code ?? '')] || lead.outlet_county_code || ''
          const phone = lead.permit_phone ?? lead.primary_phone
          const normalized = phone ? phone.replace(/\D/g, '') : ''
          const businessName = lead.display_name || lead.outlet_name
          const sms = businessName
            ? `Hi, this is Jordan with Process.Direct. I saw that ${businessName} is getting set up in Texas. Have you already gotten your card processing/POS set up?\n\nhttps://process.direct`
            : `Hi, this is Jordan with Process.Direct. I saw that your business is getting set up in Texas. Have you already gotten your card processing/POS set up?\n\nhttps://process.direct`

          return (
            <div
              key={lead.id}
              data-lead-card
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 transition-all"
            >
              {/* Business name + location + dates */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-semibold text-gray-900 text-base leading-tight hover:text-blue-600"
                  >
                    {name}
                  </Link>
                  {(city || county) && (
                    <div className="text-sm text-gray-500 mt-0.5">
                      {city}{city && county ? ', ' : ''}{county}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-4 shrink-0 text-sm">
                  {lead.permit_issue_date && (
                    <div>
                      <div className="text-xs text-gray-400">Permit</div>
                      <div className="text-gray-700 whitespace-nowrap">{fmtDate(lead.permit_issue_date)}</div>
                    </div>
                  )}
                  {lead.first_sales_date && (
                    <div>
                      <div className="text-xs text-gray-400">First Sales</div>
                      <div className="text-gray-700 whitespace-nowrap">{fmtDate(lead.first_sales_date)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div>
                <div className="text-xs text-gray-400 mb-1">Phone</div>
                {phone ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={async () => {
                        const ok = await copyToClipboard(normalized)
                        if (ok) {
                          setPhoneCopied(s => ({ ...s, [lead.id]: true }))
                          addToast(lead.id, 'Phone copied', 'success')
                          setTimeout(() => setPhoneCopied(s => ({ ...s, [lead.id]: false })), 1800)
                        } else {
                          addToast(lead.id, 'Could not copy — try again', 'error')
                        }
                      }}
                      className={`text-sm font-medium px-3 py-1.5 border rounded-lg transition-all ${
                        phoneCopied[lead.id]
                          ? 'bg-green-50 text-green-700 border-green-300 scale-105'
                          : 'bg-white text-blue-600 border-gray-200 hover:border-blue-400'
                      }`}
                    >
                      {phoneCopied[lead.id] ? '✓ Copied!' : fmtPhone(phone)}
                    </button>
                    <a
                      href={`tel:${normalized}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Phone size={13} /> Call
                    </a>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">No phone on file</span>
                )}
              </div>

              {/* SMS message — always visible */}
              <div>
                <div className="text-xs text-gray-400 mb-1">Message</div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm leading-relaxed text-slate-800 whitespace-pre-line">
                  {sms}
                </div>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={async () => {
                      const ok = await copyToClipboard(sms)
                      if (ok) {
                        setSmsCopied(s => ({ ...s, [lead.id]: true }))
                        addToast(lead.id, 'Message copied', 'success')
                        setTimeout(() => setSmsCopied(s => ({ ...s, [lead.id]: false })), 1800)
                      } else {
                        addToast(lead.id, 'Could not copy — try again', 'error')
                      }
                    }}
                    className={`text-sm px-3 py-1.5 border rounded-lg transition-all ${
                      smsCopied[lead.id]
                        ? 'bg-green-50 text-green-700 border-green-300 scale-105'
                        : 'bg-white border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {smsCopied[lead.id] ? '✓ Copied!' : 'Copy Message'}
                  </button>

                  {/* Pipeline dropdown — same row, pushed right */}
                  <div className="ml-auto">
                    <StatusDropdown
                      lead={lead}
                      onStatusChange={(s) => handleStatusChange(lead, s)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Toast stack — bottom-right, non-blocking */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2 rounded-lg text-sm font-medium shadow-md ${
              t.kind === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}
          >
            {t.kind !== 'error' ? '✓' : '⚠'} {t.text}
          </div>
        ))}
      </div>
    </>
  )
}

function StatusDropdown({
  lead,
  onStatusChange,
}: {
  lead: Lead
  onStatusChange: (s: LeadStatus) => void
}) {
  const [value, setValue] = useState<LeadStatus>(lead.status)
  const [loading, setLoading] = useState(false)

  return (
    <select
      value={value}
      disabled={loading}
      onChange={async e => {
        const v = e.target.value as LeadStatus
        setValue(v)
        setLoading(true)
        await onStatusChange(v)
        setLoading(false)
      }}
      className="text-sm rounded-lg px-2 py-1.5 border border-gray-200 bg-white min-w-[130px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
      aria-label="Pipeline status"
    >
      {LEAD_STATUSES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  )
}
