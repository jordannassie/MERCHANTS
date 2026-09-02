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

// Suggested pipeline stage from call outcome (per requirements)
function suggestStage(outcome: string): string {
  switch (outcome) {
    case 'no_answer':
      return 'attempted'
    case 'voicemail':
      return 'attempted'
    case 'connected':
      return 'connected'
    case 'call_back':
      return 'follow_up'
    case 'appointment':
      return 'appointment'
    case 'not_interested':
      return 'lost'
    case 'won':
      return 'won'
    default:
      return ''
  }
}

const PIPELINE_STAGE_OPTIONS = [
  { value: '', label: '— keep current stage —' },
  { value: 'new', label: 'New' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'connected', label: 'Connected' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
]

export function LogCallDialog({ open, onClose, leadId, contacts, onSaved }: Props) {
  const [form, setForm] = useState({
    contactId: '',
    outcome: '' as string,
    pipelineStage: '' as string,
    notes: '',
    durationMinutes: '',
    occurredAt: new Date().toISOString().slice(0, 16),
    nextFollowUpAt: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function f(k: Partial<typeof form>) {
    setForm(prev => ({ ...prev, ...k }))
  }

  function selectOutcome(outcome: string) {
    // Auto-suggest pipeline stage; user can override afterwards
    f({ outcome, pipelineStage: suggestStage(outcome) })
  }

  async function handleSave() {
    if (!form.outcome) {
      setError('Select a call outcome')
      return
    }
    setLoading(true)
    setError(null)

    const payload = {
      leadId,
      activityType: 'call',
      contactId: form.contactId || null,
      callOutcome: form.outcome,
      notes: form.notes || null,
      durationSeconds: form.durationMinutes
        ? Math.round(parseFloat(form.durationMinutes) * 60)
        : null,
      occurredAt: form.occurredAt,
      nextFollowUpAt: form.nextFollowUpAt || null,
      statusUpdate: form.pipelineStage || null,
    }

    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    let json: Record<string, unknown> = {}
    try {
      json = (await res.json()) as Record<string, unknown>
    } catch {
      /* non-JSON */
    }

    setLoading(false)

    if (!res.ok) {
      setError((json.error as string) ?? 'Failed to save call')
      return
    }
    onSaved(json.activity as Activity, json.updatedLead as Partial<Lead> | undefined)
  }

  const showFollowUp = form.pipelineStage === 'follow_up' || form.outcome === 'call_back'

  return (
    <Dialog open={open} onClose={onClose} title="Log Call" size="md">
      <div className="space-y-4">
        {/* Contact */}
        {contacts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
            <select
              value={form.contactId}
              onChange={e => f({ contactId: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              aria-label="Select contact"
            >
              <option value="">No specific contact</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.title ? ` — ${c.title}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Outcome buttons */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outcome *</label>
          <div className="grid grid-cols-2 gap-2">
            {CALL_OUTCOMES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => selectOutcome(value)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                  form.outcome === value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Pipeline stage — required, auto-suggested from outcome */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Move to Pipeline Stage
            {form.pipelineStage && (
              <span className="ml-1.5 text-xs text-blue-500 font-normal">
                (suggested from outcome)
              </span>
            )}
          </label>
          <select
            value={form.pipelineStage}
            onChange={e => f({ pipelineStage: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            aria-label="Pipeline stage"
          >
            {PIPELINE_STAGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => f({ notes: e.target.value })}
            rows={3}
            placeholder="Call notes…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            aria-label="Call notes"
          />
        </div>

        {/* Duration + time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.durationMinutes}
              onChange={e => f({ durationMinutes: e.target.value })}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Call duration in minutes"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Occurred at</label>
            <input
              type="datetime-local"
              value={form.occurredAt}
              onChange={e => f({ occurredAt: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Call time"
            />
          </div>
        </div>

        {/* Follow-up — shown when pipeline stage is Follow-up */}
        {showFollowUp && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Follow-up date & time
            </label>
            <input
              type="datetime-local"
              value={form.nextFollowUpAt}
              onChange={e => f({ nextFollowUpAt: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Follow-up date and time"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleSave} loading={loading}>
            Save Call
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
