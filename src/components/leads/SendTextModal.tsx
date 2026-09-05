'use client'

import { useState, useEffect, useRef } from 'react'
import { buildOutreachMessage } from '@/lib/outreach'

interface Props {
  lead: {
    id: string
    display_name?: string | null
    outlet_name?: string | null
    phone: string
    sms_status?: string | null
  }
  onClose: () => void
  onSent: (result: { messageId: string }) => void
}

/** Format a 10-digit string as (XXX) XXX-XXXX */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (d.length !== 10) return phone
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

const OPT_OUT_SUFFIX = '\n\nReply STOP to opt out.'

export function SendTextModal({ lead, onClose, onSent }: Props) {
  const businessName = lead.display_name || lead.outlet_name || null
  const defaultMessage = buildOutreachMessage(businessName) + OPT_OUT_SUFFIX

  const [content, setContent]   = useState(defaultMessage)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState(false)
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on open
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [loading, onClose])

  const charCount   = content.length
  const segments    = Math.max(1, Math.ceil(charCount / 160))
  const segCost     = (segments * 0.01).toFixed(2)

  async function handleSend() {
    if (!content.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/sms/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leadId: lead.id, content: content.trim() }),
      })
      const json = await res.json()

      if (!json.ok) {
        setError(json.error ?? 'SMS sending failed — please try again')
        setLoading(false)
        return
      }

      setSuccess(true)
      onSent({ messageId: json.messageId })
      setTimeout(() => onClose(), 2000)
    } catch {
      setError('SMS sending failed — please try again')
      setLoading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Send Text Message</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Recipient */}
          <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">To</div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">
                {lead.display_name || lead.outlet_name || 'Business'}
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-600 font-mono text-sm">{formatPhone(lead.phone)}</span>
            </div>
          </div>

          {/* From */}
          <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">From</div>
            <div className="text-sm text-gray-600 font-mono">(949) 736-1560</div>
          </div>

          {/* Message */}
          <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Message</div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(null) }}
              disabled={loading || success}
              rows={9}
              className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
              <span>{charCount} characters</span>
              <span>{segments} segment{segments !== 1 ? 's' : ''} (est. ~${segCost})</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ⚠ {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 font-medium">
              ✓ Sent successfully
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading || success}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || success || !content.trim()}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending…
              </>
            ) : (
              '📱 Confirm & Send'
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
