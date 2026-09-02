'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Lead } from '@/lib/types'
import { fmtPhone, PRIORITY_COLORS } from '@/lib/utils'
import { Phone, Star, FileText } from 'lucide-react'
import { NotepadPanel } from '@/components/leads/NotepadPanel'

interface Props {
  status: string
  label: string
  leads: Lead[]
}

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
  const [notepadLead, setNotepadLead] = useState<Lead | null>(null)
  // Local cache so "Note saved" badge updates immediately without page refresh
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({})

  async function moveCard(leadId: string, newStatus: string) {
    await fetch(`/api/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
  }

  return (
    <>
      <div className="flex-shrink-0 w-64">
        {/* Column header */}
        <div
          className={`rounded-lg px-3 py-1.5 mb-3 flex items-center justify-between ${COL_COLORS[status] ?? 'bg-gray-100'}`}
        >
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs font-medium">{leads.length}</span>
        </div>

        <div className="space-y-2">
          {leads.map(lead => {
            const phone = lead.permit_phone ?? lead.primary_phone
            // Use local override if note was saved this session; fall back to DB value
            const hasNote =
              lead.id in localNotes
                ? Boolean(localNotes[lead.id])
                : Boolean(lead.main_note)

            return (
              <div
                key={lead.id}
                className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm"
              >
                {/* Business name + star */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-medium text-sm text-gray-900 hover:text-blue-600 line-clamp-2"
                  >
                    {lead.display_name || lead.outlet_name || '(Unnamed)'}
                  </Link>
                  {lead.starred && (
                    <Star size={11} className="text-yellow-400 fill-yellow-400 shrink-0 mt-0.5" />
                  )}
                </div>

                {/* City + priority badge */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 truncate pr-1">{lead.outlet_city}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${PRIORITY_COLORS[lead.priority]}`}
                  >
                    {lead.priority}
                  </span>
                </div>

                {/* Best phone display */}
                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    className="text-xs text-blue-600 flex items-center gap-1 mb-2 hover:underline"
                  >
                    <Phone size={10} />
                    {fmtPhone(phone)}
                    {lead.permit_phone && !lead.primary_phone && (
                      <span className="text-[10px] text-gray-400">permit</span>
                    )}
                  </a>
                ) : (
                  <p className="text-xs text-gray-300 mb-2">No phone</p>
                )}

                {/* Call + Note buttons */}
                <div className="flex gap-1.5 mb-2">
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

                  <button
                    onClick={() => setNotepadLead(lead)}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-yellow-900 transition-colors"
                  >
                    <FileText size={10} /> Note
                    {hasNote && (
                      <span className="w-2 h-2 rounded-full bg-yellow-700 ml-0.5" title="Note saved" />
                    )}
                  </button>
                </div>

                {/* Compact "Note saved" indicator — acts as a second tap target */}
                {hasNote && (
                  <button
                    onClick={() => setNotepadLead(lead)}
                    className="w-full text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mb-2 flex items-center gap-1 hover:bg-yellow-100 transition-colors"
                  >
                    <FileText size={9} />
                    <span>Note saved</span>
                  </button>
                )}

                {/* Status dropdown */}
                <select
                  value={status}
                  onChange={e => moveCard(lead.id, e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label={`Move ${lead.display_name ?? 'lead'} to status`}
                >
                  {[
                    'new',
                    'attempted',
                    'connected',
                    'follow_up',
                    'appointment',
                    'won',
                    'lost',
                    'do_not_contact',
                  ].map(s => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
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

      {/* Notepad overlay — one per column, portal-like */}
      {notepadLead && (
        <NotepadPanel
          key={notepadLead.id}
          leadId={notepadLead.id}
          leadName={notepadLead.display_name || notepadLead.outlet_name || '(Unnamed)'}
          initialNote={notepadLead.main_note ?? null}
          initialUpdatedAt={notepadLead.main_note_updated_at ?? null}
          onClose={() => setNotepadLead(null)}
          onSaved={(note) => {
            setLocalNotes(prev => ({ ...prev, [notepadLead.id]: note }))
          }}
        />
      )}
    </>
  )
}
