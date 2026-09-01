'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Lead } from '@/lib/types'
import { fmtPhone, PRIORITY_COLORS } from '@/lib/utils'
import { Phone, Star } from 'lucide-react'

interface Props { status: string; label: string; leads: Lead[] }

const COL_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  attempted: 'bg-yellow-100 text-yellow-800',
  connected: 'bg-blue-100 text-blue-800',
  follow_up: 'bg-orange-100 text-orange-800',
  appointment: 'bg-purple-100 text-purple-800',
  won: 'bg-green-100 text-green-800',
}

export function PipelineColumn({ status, label, leads }: Props) {
  const router = useRouter()

  async function moveCard(leadId: string, newStatus: string) {
    await fetch(`/api/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
  }

  return (
    <div className="flex-shrink-0 w-64">
      <div className={`rounded-lg px-3 py-1.5 mb-3 flex items-center justify-between ${COL_COLORS[status] ?? 'bg-gray-100'}`}>
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs">{leads.length}</span>
      </div>

      <div className="space-y-2">
        {leads.map(lead => (
          <div key={lead.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2 mb-2">
              <Link href={`/leads/${lead.id}`} className="font-medium text-sm text-gray-900 hover:text-blue-600 line-clamp-2">
                {lead.display_name || lead.outlet_name || '(Unnamed)'}
              </Link>
              {lead.starred && <Star size={11} className="text-yellow-400 fill-yellow-400 shrink-0 mt-0.5" />}
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{lead.outlet_city}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[lead.priority]}`}>{lead.priority}</span>
            </div>
            {lead.primary_phone && (
              <a href={`tel:${lead.primary_phone}`} className="text-xs text-blue-600 flex items-center gap-1 mb-2 hover:underline">
                <Phone size={10} /> {fmtPhone(lead.primary_phone)}
              </a>
            )}
            <div>
              <select
                value={status}
                onChange={e => moveCard(lead.id, e.target.value)}
                className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label={`Move ${lead.display_name ?? 'lead'} to status`}
              >
                {['new','attempted','connected','follow_up','appointment','won','lost','do_not_contact'].map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400">No leads</p>
          </div>
        )}
      </div>
    </div>
  )
}
