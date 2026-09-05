'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lead } from '@/lib/types'
import { fmtDate, fmtPhone } from '@/lib/utils'
import { Phone } from 'lucide-react'
import { LEAD_STATUSES, COUNTY_NAMES } from '@/lib/constants'
import type { LeadStatus } from '@/lib/types'
import { buildOutreachMessage } from '@/lib/outreach'
import { SendTextModal } from '@/components/leads/SendTextModal'
import { isValidUSPhone } from '@/lib/source-utils'

interface Props { leads: Lead[] }

/** Relative time for sms_last_sent_at */
function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function LeadsTable({ leads }: Props) {
  const [leadsList, setLeadsList] = useState<Lead[]>(leads)
  const [phoneCopied, setPhoneCopied]   = useState<Record<string, boolean>>({})
  const [smsCopied, setSmsCopied]       = useState<Record<string, boolean>>({})
  const [toasts, setToasts]             = useState<Array<{ id: string; text: string; kind: 'success' | 'error' }>>([])
  const [smsModal, setSmsModal]         = useState<{ lead: Lead; phone: string } | null>(null)

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

  function handleSmsSent(lead: Lead, result: { messageId: string }) {
    addToast(lead.id, 'Text sent!', 'success')
    setLeadsList(prev =>
      prev.map(p =>
        p.id === lead.id
          ? { ...p, sms_status: 'submitted', sms_last_sent_at: new Date().toISOString() }
          : p
      )
    )
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
          const sms = buildOutreachMessage(businessName)

          const canSendSms    = !!phone && isValidUSPhone(phone) && lead.status !== 'do_not_contact' && lead.sms_status !== 'opted_out'
          const isOptedOut    = lead.sms_status === 'opted_out' || lead.status === 'do_not_contact'
          const needsReply    = lead.sms_needs_reply === true || lead.sms_status === 'needs_reply'
          const sentAgo       = relativeTime(lead.sms_last_sent_at)

          return (
            <div
              key={lead.id}
              data-lead-card
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 transition-all"
            >
              {/* Business name + location + dates */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-semibold text-gray-900 text-base leading-tight hover:text-blue-600"
                    >
                      {name}
                    </Link>
                    {needsReply && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-orange-50 border-orange-200 text-orange-700 tracking-wide">
                        💬 Needs Reply
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* Source badge */}
                    {lead.lead_source_label && (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide ${
                        lead.lead_source_label === 'both'
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : lead.lead_source_label === 'google'
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {lead.lead_source_label === 'both'
                          ? '🏛📍 STATE + MAPS'
                          : lead.lead_source_label === 'google'
                            ? '📍 MAPS'
                            : '🏛 STATE'}
                      </span>
                    )}
                    {(city || county) && (
                      <span className="text-sm text-gray-500">
                        {city}{city && county ? ', ' : ''}{county}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-4 shrink-0 text-sm flex-wrap justify-end">
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
                  {lead.google_maps_url && (
                    <a
                      href={lead.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="self-start text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                      title="View on Google Maps"
                    >
                      View Maps ↗
                    </a>
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

                    {/* SMS button / badge */}
                    {isOptedOut ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-400 border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed">
                        🚫 Opted Out
                      </span>
                    ) : canSendSms ? (
                      <button
                        onClick={() => setSmsModal({ lead, phone })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                      >
                        📱 Send Text
                      </button>
                    ) : null}

                    {/* Last sent timestamp */}
                    {sentAgo && !isOptedOut && (
                      <span className="text-xs text-gray-400">Sent {sentAgo}</span>
                    )}
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

      {/* SMS Modal */}
      {smsModal && (
        <SendTextModal
          lead={{ ...smsModal.lead, phone: smsModal.phone }}
          onClose={() => setSmsModal(null)}
          onSent={(result) => {
            handleSmsSent(smsModal.lead, result)
            setSmsModal(null)
          }}
        />
      )}
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
