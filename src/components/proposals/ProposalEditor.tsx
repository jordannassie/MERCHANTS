'use client'

import { useState } from 'react'
import { getProposalUrl } from '@/lib/proposals'
import type { Lead } from '@/lib/types'

interface Props {
  lead: Lead
  onUpdate?: (updated: Partial<Lead>) => void
}

const STATUS_BADGE: Record<string, string> = {
  not_sent:             'bg-gray-100 text-gray-500 border-gray-200',
  sent:                 'bg-blue-50 text-blue-700 border-blue-200',
  viewed:               'bg-amber-50 text-amber-700 border-amber-200',
  agreement_requested:  'bg-purple-50 text-purple-700 border-purple-200',
  accepted:             'bg-green-50 text-green-700 border-green-200',
}

function fmtMoney(n: unknown): string {
  const num = Number(n)
  if (!n || isNaN(num)) return '—'
  return '$' + Math.round(num).toLocaleString()
}

export function ProposalEditor({ lead, onUpdate }: Props) {
  const [savings, setSavings]   = useState(lead.proposal_savings_monthly?.toString() ?? '')
  const [rate, setRate]         = useState(lead.proposal_transaction_rate ?? '')
  const [equipment, setEquip]   = useState(lead.proposal_equipment ?? '')
  const [contract, setContract] = useState(lead.proposal_contract ?? '')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const slug       = lead.proposal_slug
  const proposalUrl = slug ? getProposalUrl(slug) : null
  const status     = lead.proposal_status ?? 'not_sent'
  const statusLabel = status === 'not_sent'            ? 'Not Sent'
    : status === 'sent'                                 ? 'Sent'
    : status === 'viewed'                               ? 'Viewed'
    : status === 'agreement_requested'                  ? '⏳ Agreement Requested'
    : status === 'accepted'                             ? '✓ Accepted'
    : status

  async function handleSave() {
    if (!slug) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/proposals/${slug}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savings_monthly:  savings ? parseFloat(savings) : null,
          transaction_rate: rate || null,
          equipment:        equipment || null,
          contract:         contract || null,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onUpdate?.({
        proposal_savings_monthly:  savings ? parseFloat(savings) : null,
        proposal_transaction_rate: rate || null,
        proposal_equipment:        equipment || null,
        proposal_contract:         contract || null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    if (!proposalUrl) return
    try {
      await navigator.clipboard.writeText(proposalUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch {}
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-900">Proposal</h2>
        {status && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[status] ?? STATUS_BADGE.not_sent}`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Proposal URL */}
      {proposalUrl ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 font-mono truncate">
            {proposalUrl}
          </span>
          <a
            href={proposalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2.5 py-1 border border-gray-200 rounded-md hover:bg-gray-50 text-gray-600 transition-colors"
          >
            Open ↗
          </a>
          <button
            onClick={copyLink}
            className={`text-xs px-2.5 py-1 border rounded-md transition-all ${
              linkCopied
                ? 'bg-green-50 text-green-700 border-green-300'
                : 'border-gray-200 hover:bg-gray-50 text-gray-600'
            }`}
          >
            {linkCopied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">
          No proposal slug assigned yet. Generate one by saving fields below.
        </p>
      )}

      {/* Editable fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Estimated Monthly Savings ($)
          </label>
          <input
            type="number"
            min={0}
            value={savings}
            onChange={e => setSavings(e.target.value)}
            placeholder="e.g. 245"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Transaction Fee
          </label>
          <input
            type="text"
            value={rate}
            onChange={e => setRate(e.target.value)}
            placeholder="e.g. 2.69% + $0.10"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Equipment
          </label>
          <input
            type="text"
            value={equipment}
            onChange={e => setEquip(e.target.value)}
            placeholder="e.g. Clover Flex"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Contract
          </label>
          <input
            type="text"
            value={contract}
            onChange={e => setContract(e.target.value)}
            placeholder="e.g. Month-to-month"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠ {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !slug}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Proposal'}
        </button>
        {!slug && (
          <span className="text-xs text-gray-400">
            Proposal URL not yet generated — go to Leads to trigger slug creation.
          </span>
        )}
      </div>

      {/* ── Customer response — read-only ───────────────────────────────── */}
      {(lead.proposal_selected_option ||
        lead.estimated_monthly_card_sales ||
        lead.proposal_calc_snapshot) && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Customer Response
          </p>

          {lead.proposal_selected_option && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Selected plan:</span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  lead.proposal_selected_option === 'wholesale'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-green-50 text-green-700 border-green-200'
                }`}
              >
                {lead.proposal_selected_option === 'wholesale'
                  ? 'Wholesale / Lower-cost Processing'
                  : '$0 Merchant Processing'}
              </span>
            </div>
          )}

          {lead.estimated_monthly_card_sales != null && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Est. monthly card sales:</span>
              <span className="font-semibold text-gray-700">
                {fmtMoney(lead.estimated_monthly_card_sales)}/mo
              </span>
            </div>
          )}

          {lead.proposal_calc_snapshot && (
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 space-y-1">
              {(lead.proposal_calc_snapshot as Record<string, unknown>).monthly_savings != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Monthly savings:</span>
                  <span className="font-semibold text-green-600">
                    {fmtMoney(
                      (lead.proposal_calc_snapshot as Record<string, unknown>).monthly_savings
                    )}
                    /mo
                  </span>
                </div>
              )}
              {(lead.proposal_calc_snapshot as Record<string, unknown>).yearly_savings != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Annual savings:</span>
                  <span className="font-semibold text-green-600">
                    {fmtMoney(
                      (lead.proposal_calc_snapshot as Record<string, unknown>).yearly_savings
                    )}
                    /yr
                  </span>
                </div>
              )}
              {(lead.proposal_calc_snapshot as Record<string, unknown>).effective_rate != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Rate quoted:</span>
                  <span className="font-semibold text-gray-700">
                    {Number(
                      (lead.proposal_calc_snapshot as Record<string, unknown>).effective_rate
                    ).toFixed(2)}
                    %
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
