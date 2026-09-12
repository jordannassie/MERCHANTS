'use client'

import { useState, useEffect } from 'react'
import { InitialSmsPreview } from '@/components/sms/InitialSmsPreview'
import { STOP_LINE } from '@/lib/outreach'

interface Props {
  lead: {
    id: string
    display_name?: string | null
    outlet_name?: string | null
    outlet_city?: string | null
    phone: string
    sms_status?: string | null
    proposal_slug?: string | null
  }
  onClose: () => void
  onSent: (result: { messageId: string }) => void
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (d.length !== 10) return phone
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function SendTextModal({ lead, onClose, onSent }: Props) {
  const [message, setMessage]     = useState('')
  const [proposalUrl, setProposalUrl] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [compliant, setCompliant] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingPreview(true)
    fetch(`/api/sms/preview?leadId=${encodeURIComponent(lead.id)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (!data.ok) {
          setPreviewError(data.error ?? 'Could not build the Initial SMS preview')
          return
        }
        setMessage(data.message)
        setProposalUrl(data.proposalUrl ?? '')
        setCompliant(data.compliant === true)
      })
      .catch(() => {
        if (!cancelled) setPreviewError('Could not build the Initial SMS preview')
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false)
      })
    return () => { cancelled = true }
  }, [lead.id])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [loading, onClose])

  const hasStop = message.includes(STOP_LINE)
  const lastLine = message.split('\n').map(l => l.trim()).filter(Boolean).pop() ?? ''
  const urlIsLast = lastLine === proposalUrl || lastLine.startsWith('http')
  const canSend = !loadingPreview && !previewError && compliant && confirmed && !!message && !loading && !success

  async function handleSend() {
    if (!canSend) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/sms/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ leadId: lead.id, useInitialTemplate: true }),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Send Initial SMS</h2>
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

          <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
              Exact message that will be sent to QUO
            </div>
            {loadingPreview ? (
              <p className="text-sm text-gray-400 py-6 text-center">Building preview…</p>
            ) : previewError ? (
              <p className="text-sm text-red-600">{previewError}</p>
            ) : (
              <InitialSmsPreview message={message} />
            )}
          </div>

          {!loadingPreview && !previewError && (
            <div className="text-xs space-y-1">
              <p className={hasStop ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                {hasStop ? '✓ Includes “Reply STOP to opt out.”' : '✗ Missing STOP line'}
              </p>
              <p className={urlIsLast ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                {urlIsLast ? '✓ Proposal URL is the last line' : '✗ Proposal URL is not the last line'}
              </p>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              disabled={loadingPreview || !!previewError || !compliant}
              className="mt-0.5"
            />
            I reviewed this exact message. The STOP line and proposal URL match what QUO will send.
          </label>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ⚠ {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 font-medium">
              ✓ Sent successfully
            </div>
          )}
        </div>

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
            disabled={!canSend}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending…
              </>
            ) : (
              '📱 Send this exact message'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
