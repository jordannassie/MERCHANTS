'use client'

import Link from 'next/link'
import type { Lead } from '@/lib/types'
import { fmtPhone } from '@/lib/utils'
import { Phone } from 'lucide-react'

interface Props {
  status: string
  label: string
  leads: Lead[]
}

const COL_COLORS: Record<string, string> = {
  attempted:            'bg-yellow-100 text-yellow-800',
  connected:            'bg-blue-100 text-blue-800',
  agreement_requested:  'bg-green-100 text-green-800',
  appointment:          'bg-green-100 text-green-800',
  won:                  'bg-emerald-100 text-emerald-800',
  lost:                 'bg-gray-100 text-gray-500',
  do_not_contact:       'bg-red-50 text-red-600',
}

export function PipelineColumn({ status, label, leads }: Props) {
  return (
    <div className="flex-shrink-0 w-64 min-w-[256px]">
      {/* Column header */}
      <div
        className={`sticky top-0 z-10 rounded-lg px-3 py-1.5 mb-3 flex items-center justify-between ${COL_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}
      >
        <span className="text-sm font-semibold tracking-wide">{label}</span>
        <span className="text-xs font-medium">{leads.length}</span>
      </div>

      <div className="space-y-2">
        {leads.map(lead => {
          const phone = lead.permit_phone ?? lead.primary_phone
          const viewCount = lead.proposal_view_count ?? 0
          const followupStep = lead.followup_step ?? 0
          const isAgreement = lead.status === 'agreement_requested'

          return (
            <div
              key={lead.id}
              className={`bg-white rounded-xl border p-3 shadow-sm ${
                isAgreement ? 'border-green-200' : 'border-gray-200'
              }`}
            >
              {/* Business name */}
              <div className="mb-1.5">
                <Link
                  href={`/leads/${lead.id}`}
                  className="font-medium text-sm text-gray-900 hover:text-blue-600 line-clamp-2"
                >
                  {lead.display_name || lead.outlet_name || '(Unnamed)'}
                </Link>
                {lead.outlet_city && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{lead.outlet_city}</p>
                )}
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1 mb-2">
                {lead.sms_needs_reply && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
                    Replied
                  </span>
                )}
                {isAgreement && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
                    Agreement
                  </span>
                )}
                {viewCount > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                    Proposal viewed {viewCount}×
                  </span>
                )}
                {followupStep > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-100">
                    Follow-up {followupStep} of 3
                  </span>
                )}
              </div>

              {/* Phone */}
              {phone ? (
                <a
                  href={`tel:${phone}`}
                  className="text-xs text-blue-600 flex items-center gap-1 mb-2 hover:underline"
                >
                  <Phone size={10} />
                  {fmtPhone(phone)}
                </a>
              ) : (
                <p className="text-xs text-gray-300 mb-2">No phone</p>
              )}

              {/* Actions */}
              <div className="flex gap-1.5">
                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    <Phone size={10} /> Call
                  </a>
                ) : (
                  <Link
                    href={`/leads/${lead.id}`}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
                  >
                    Find phone
                  </Link>
                )}

                <Link
                  href={`/leads/${lead.id}`}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                >
                  Open
                </Link>
              </div>
            </div>
          )
        })}

        {leads.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400">No leads</p>
          </div>
        )}
      </div>
    </div>
  )
}
