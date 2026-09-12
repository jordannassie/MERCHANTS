'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { buildInitialOutreachMessage, INITIAL_SMS_TEMPLATE } from '@/lib/outreach'
import { InitialSmsPreview } from '@/components/sms/InitialSmsPreview'

interface Messages {
  initial: string
  message1: string
  message2: string
  message3: string
}

const DEFAULT_MESSAGES: Messages = {
  initial: INITIAL_SMS_TEMPLATE,
  message1:
    "Hi, just wanted to make sure you received the proposal I sent over for {BUSINESS_NAME}. I'm here if you have any questions.\n\nJordan",
  message2:
    "Hi, Jordan again from Process Direct. If you're still getting your payment setup handled, we can help get everything ready and include the POS system at no cost.\n\nHere's your proposal again:\n{PROPOSAL_URL}\n\nJordan",
  message3:
    "Hi, just checking one last time before I close this out. Have you already handled your POS and card processing for {BUSINESS_NAME}?\n\nJordan",
}

export function SmsSequencePanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Messages>(DEFAULT_MESSAGES)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  const fetchMessages = useCallback(async () => {
    if (hasFetched.current) return
    hasFetched.current = true
    setLoading(true)
    try {
      const res = await fetch('/api/settings/sms-sequence')
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch {
      // silently keep defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchMessages()
  }, [open, fetchMessages])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/sms-sequence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'Failed to save')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  const panelContent = (
    <div className="mt-4 space-y-5">
      {loading && (
        <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
      )}

      {!loading && (
        <>
          <SequenceStep
            day="Day 0"
            mode="Editable"
            title="INITIAL SMS"
            value={messages.initial}
            rows={14}
            onChange={v => setMessages(m => ({ ...m, initial: v }))}
          />
          <p className="text-[11px] text-gray-500 -mt-3">
            Required: <code className="bg-gray-100 px-1 rounded">Reply STOP to opt out.</code> immediately before{' '}
            <code className="bg-gray-100 px-1 rounded">{'{PROPOSAL_URL}'}</code>, which must be the last line.
            This is the exact template used by every Initial SMS preview and QUO send.
          </p>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-gray-500">Rendered example (same builder as QUO)</p>
            <InitialSmsPreview
              message={buildInitialOutreachMessage(
                'SANTO TACO',
                'https://process.direct/p/santo-taco',
                'Austin',
                messages.initial,
              )}
            />
          </div>

          {/* Follow-up 1 */}
          <SequenceStep
            day="Day 1"
            mode="Automatic"
            title="FOLLOW-UP 1"
            value={messages.message1}
            onChange={v => setMessages(m => ({ ...m, message1: v }))}
          />

          {/* Follow-up 2 */}
          <SequenceStep
            day="Day 3"
            mode="Automatic"
            title="FOLLOW-UP 2"
            value={messages.message2}
            onChange={v => setMessages(m => ({ ...m, message2: v }))}
          />

          {/* Follow-up 3 */}
          <SequenceStep
            day="Day 7"
            mode="Automatic"
            title="FOLLOW-UP 3"
            value={messages.message3}
            onChange={v => setMessages(m => ({ ...m, message3: v }))}
          />

          {/* Stop conditions */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-600 mb-2">Automation stops immediately if:</p>
            <ul className="space-y-1 ml-2">
              <li>• Merchant replies</li>
              <li>• Merchant requests Service Agreement</li>
              <li>• Lead is DNC</li>
              <li>• Lead is Lost or Won</li>
            </ul>
          </div>

          {/* Placeholder hint */}
          <div className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            <span className="font-medium text-gray-500">Available placeholders:</span>{' '}
            <code className="bg-gray-100 rounded px-1 py-0.5">{'{BUSINESS_NAME}'}</code>{' '}
            <code className="bg-gray-100 rounded px-1 py-0.5">{'{CITY}'}</code>{' '}
            <code className="bg-gray-100 rounded px-1 py-0.5">{'{PROPOSAL_URL}'}</code>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Messages'}
            </button>
            {saved && (
              <span className="text-sm font-medium text-green-600">✓ Saved</span>
            )}
            {error && (
              <span className="text-sm text-red-500">{error}</span>
            )}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            📋 SMS Sequence
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Edit Initial SMS and the 3 automated follow-up messages
          </p>
        </div>
        {open
          ? <ChevronUp size={16} className="text-gray-400 shrink-0" />
          : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>

      {open && panelContent}
    </div>
  )
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function SequenceStep({
  day,
  mode,
  title,
  value,
  readOnly,
  rows = 5,
  onChange,
}: {
  day: string
  mode: 'Editable' | 'Automatic'
  title: string
  value: string
  readOnly?: boolean
  rows?: number
  onChange?: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          mode === 'Automatic'
            ? 'bg-blue-50 text-blue-600 border border-blue-100'
            : 'bg-gray-100 text-gray-500 border border-gray-200'
        }`}>
          {mode}
        </span>
        <span className="text-[10px] text-gray-400">{day}</span>
        {readOnly && (
          <span className="text-[10px] text-gray-300 ml-auto">read-only</span>
        )}
      </div>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        rows={rows}
        className={`w-full rounded-lg border text-xs font-mono p-3 resize-y leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-400 ${
          readOnly
            ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-default'
            : 'bg-white border-gray-200 text-gray-700'
        }`}
      />
    </div>
  )
}

