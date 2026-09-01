'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import type { Contact, Activity, Lead } from '@/lib/types'
import { CALL_OUTCOMES } from '@/lib/constants'

interface Props {
  open: boolean
  onClose: () => void
  leadId: string
  contacts: Contact[]
  onSaved: (activity: Activity, updatedLead?: Partial<Lead>) => void
}

export function LogCallDialog({ open, onClose, leadId, contacts, onSaved }: Props) {
  const [form, setForm] = useState({
    contactId: '',
    outcome: '' as string,
    notes: '',
    durationMinutes: '',
    occurredAt: new Date().toISOString().slice(0, 16),
    nextFollowUpAt: '',
    statusUpdate: '',
    notInterestedDisposition: 'lost' as 'lost' | 'do_not_contact',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const f = (k: Partial<typeof form>) => setForm(prev => ({ ...prev, ...k }))

  async function handleSave() {
    if (!form.outcome) { setError('Select an outcome'); return }
    setLoading(true)
    setError(null)

    const payload = {
      leadId,
      activityType: 'call',
      contactId: form.contactId || null,
      callOutcome: form.outcome,
      notes: form.notes || null,
      durationSeconds: form.durationMinutes ? Math.round(parseFloat(form.durationMinutes) * 60) : null,
      occurredAt: form.occurredAt,
      nextFollowUpAt: form.nextFollowUpAt || null,
      statusUpdate: form.outcome === 'not_interested' ? form.notInterestedDisposition : autoStatus(form.outcome),
    }

    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    onSaved(json.activity, json.updatedLead)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log Call" size="md">
      <div className="space-y-4">
        {/* Contact */}
        {contacts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
            <select value={form.contactId} onChange={e => f({ contactId: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              aria-label="Select contact">
              <option value="">No specific contact</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.title ? ` — ${c.title}` : ''}</option>)}
            </select>
          </div>
        )}

        {/* Outcome */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outcome *</label>
          <div className="grid grid-cols-2 gap-2">
            {CALL_OUTCOMES.map(({ value, label }) => (
              <button key={value} type="button"
                onClick={() => f({ outcome: value })}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${form.outcome === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Not interested: lost vs DNC */}
        {form.outcome === 'not_interested' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Disposition</label>
            <div className="flex gap-2">
              {(['lost', 'do_not_contact'] as const).map(v => (
                <button key={v} type="button" onClick={() => f({ notInterestedDisposition: v })}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${form.notInterestedDisposition === v ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                  {v === 'lost' ? 'Mark Lost' : 'Do Not Contact'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => f({ notes: e.target.value })}
            rows={3} placeholder="Call notes…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            aria-label="Call notes" />
        </div>

        {/* Duration + time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
            <input type="number" min="0" step="0.5" value={form.durationMinutes} onChange={e => f({ durationMinutes: e.target.value })}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Call duration in minutes" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Occurred at</label>
            <input type="datetime-local" value={form.occurredAt} onChange={e => f({ occurredAt: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Call time" />
          </div>
        </div>

        {/* Follow-up */}
        {['call_back', 'connected', 'voicemail'].includes(form.outcome) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule follow-up</label>
            <input type="datetime-local" value={form.nextFollowUpAt} onChange={e => f({ nextFollowUpAt: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Follow-up date and time" />
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleSave} loading={loading}>Save Call</Button>
        </div>
      </div>
    </Dialog>
  )
}

function autoStatus(outcome: string): string | null {
  switch (outcome) {
    case 'no_answer': case 'voicemail': return 'attempted'
    case 'connected': return 'connected'
    case 'call_back': return 'follow_up'
    case 'appointment': return 'appointment'
    case 'won': return 'won'
    default: return null
  }
}
