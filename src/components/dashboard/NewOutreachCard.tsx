'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { InitialSmsPreview } from '@/components/sms/InitialSmsPreview'
import { STOP_LINE } from '@/lib/outreach'

interface Props {
  enabled: boolean
  batchSize: number
  sendTime: string
  eligibleCount: number
  lastRunDate: string
}

interface BatchResult {
  requested: number
  sent: number
  failed: number
  skipped: number
  errors: string[]
}

export function NewOutreachCard({
  enabled: initialEnabled,
  batchSize: initialBatchSize,
  sendTime: initialSendTime,
  eligibleCount: initialEligibleCount,
  lastRunDate: initialLastRunDate,
}: Props) {
  const [enabled, setEnabled]               = useState(initialEnabled)
  const [batchSize, setBatchSize]           = useState(initialBatchSize)
  const [sendTime, setSendTime]             = useState(initialSendTime)
  const [eligibleCount]                     = useState(initialEligibleCount)
  const [lastRunDate, setLastRunDate]       = useState(initialLastRunDate)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [sending, setSending]               = useState(false)
  const [batchResult, setBatchResult]       = useState<BatchResult | null>(null)
  const [saveError, setSaveError]           = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    message: string
    displayName?: string
    city?: string | null
    proposalUrl?: string
    compliant?: boolean
  } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewConfirmed, setPreviewConfirmed] = useState(false)

  // Debounced auto-save for number/time inputs
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveSettings = useCallback(
    (patch: { enabled?: boolean; batchSize?: number; sendTime?: string }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        try {
          setSaveError(null)
          const res = await fetch('/api/new-outreach/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            setSaveError((data as { error?: string }).error ?? 'Failed to save')
          }
        } catch {
          setSaveError('Failed to save')
        }
      }, 600)
    },
    [],
  )

  // Clean up timer on unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  async function toggleEnabled() {
    setTogglingEnabled(true)
    const next = !enabled
    try {
      const res = await fetch('/api/new-outreach/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (res.ok) {
        setEnabled(next)
      } else {
        console.error('[NewOutreachCard] toggle failed')
      }
    } catch (err) {
      console.error('[NewOutreachCard] toggle error:', err)
    } finally {
      setTogglingEnabled(false)
    }
  }

  function handleBatchSizeChange(value: string) {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 1) return
    setBatchSize(n)
    saveSettings({ batchSize: n })
  }

  function handleSendTimeChange(value: string) {
    setSendTime(value)
    saveSettings({ sendTime: value })
  }

  async function sendBatch() {
    setSending(true)
    setBatchResult(null)
    try {
      const res = await fetch('/api/new-outreach/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setBatchResult({
          requested: data.requested,
          sent:      data.sent,
          failed:    data.failed,
          skipped:   data.skipped,
          errors:    data.errors ?? [],
        })
        // Update lastRunDate to today
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
        setLastRunDate(today)
      } else {
        setBatchResult({
          requested: batchSize,
          sent: 0, failed: 0, skipped: 0,
          errors: [data.error ?? 'Unknown error'],
        })
      }
    } catch (err) {
      setBatchResult({
        requested: batchSize,
        sent: 0, failed: 0, skipped: 0,
        errors: [String(err)],
      })
    } finally {
      setSending(false)
      setShowConfirmModal(false)
    }
  }

  // ── Stats helpers ──────────────────────────────────────────────────────────

  function formatTime(t: string) {
    const [h, m] = t.split(':').map(Number)
    const period = (h ?? 0) >= 12 ? 'PM' : 'AM'
    const hour12 = (h ?? 0) % 12 || 12
    return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`
  }

  function nextBatchLabel(): string {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const timeLabel = `${formatTime(sendTime)} CT`
    if (lastRunDate === today) return `Tomorrow at ${timeLabel}`
    return `Today at ${timeLabel} — not yet run`
  }

  function lastBatchLabel(): string {
    if (!lastRunDate) return 'Never'
    if (batchResult && lastRunDate === new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })) {
      return `Today — ${batchResult.sent} sent, ${batchResult.failed} failed`
    }
    return lastRunDate
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-800">New Outreach</h2>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  enabled
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-gray-100 text-gray-500 border border-gray-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                {enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {enabled
                ? 'Automatically sends the first proposal SMS to eligible NEW leads daily.'
                : 'Automatic new outreach is OFF. Manual Send Text continues working normally.'}
            </p>
          </div>

          <button
            onClick={toggleEnabled}
            disabled={togglingEnabled}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              enabled
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {togglingEnabled ? '…' : enabled ? 'Turn Off' : 'Turn On'}
          </button>
        </div>

        {/* Settings section */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-32 shrink-0">Leads per batch</span>
            <input
              type="number"
              min={1}
              value={batchSize}
              onChange={e => handleBatchSizeChange(e.target.value)}
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-32 shrink-0">Send daily at</span>
            <input
              type="time"
              value={sendTime}
              onChange={e => handleSendTimeChange(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <span className="text-xs text-gray-400">CT</span>
          </div>
          {saveError && (
            <p className="text-xs text-red-600">{saveError}</p>
          )}
        </div>

        {/* Stats */}
        <div className="border-t border-gray-100 pt-4 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-32 shrink-0">Eligible NEW leads</span>
            <span className="text-sm font-semibold text-gray-800">{eligibleCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-32 shrink-0">Next batch</span>
            <span className="text-xs text-gray-700">{nextBatchLabel()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-32 shrink-0">Last batch</span>
            <span className="text-xs text-gray-700">{lastBatchLabel()}</span>
          </div>
        </div>

        {/* Batch result */}
        {batchResult && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            batchResult.errors.length > 0
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-green-50 border-green-200 text-green-800'
          }`}>
            <p className="font-semibold mb-1">Batch complete</p>
            <p className="text-xs">
              Requested: {batchResult.requested} &nbsp;|&nbsp;
              Sent: {batchResult.sent} &nbsp;|&nbsp;
              Failed: {batchResult.failed} &nbsp;|&nbsp;
              Skipped: {batchResult.skipped}
            </p>
            {batchResult.errors.length > 0 && (
              <p className="text-xs mt-1 text-yellow-700">
                {batchResult.errors.slice(0, 3).join(', ')}
                {batchResult.errors.length > 3 && ` (+${batchResult.errors.length - 3} more)`}
              </p>
            )}
          </div>
        )}

        {/* Action button */}
        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={async () => {
              setBatchResult(null)
              setPreview(null)
              setPreviewError(null)
              setPreviewConfirmed(false)
              setShowConfirmModal(true)
              setPreviewLoading(true)
              try {
                const res = await fetch('/api/new-outreach/preview')
                const data = await res.json()
                if (!res.ok || !data.ok) {
                  setPreviewError(data.error ?? 'Could not preview the Initial SMS')
                } else {
                  setPreview(data)
                }
              } catch {
                setPreviewError('Could not preview the Initial SMS')
              } finally {
                setPreviewLoading(false)
              }
            }}
            disabled={sending}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : "Send Today's Batch Now"}
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900">
              Review the exact Initial SMS before sending
            </h3>
            <p className="text-sm text-gray-600">
              Up to <strong>{batchSize.toLocaleString()}</strong> NEW leads will get this same
              template, personalized with their business name, city, and proposal URL.
            </p>
            {previewLoading && (
              <p className="text-sm text-gray-400">Loading a real lead preview…</p>
            )}
            {previewError && (
              <p className="text-sm text-red-600">{previewError}</p>
            )}
            {preview && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Preview for <strong>{preview.displayName ?? 'next eligible lead'}</strong>
                  {preview.city ? ` · ${preview.city}` : ''}
                </p>
                <InitialSmsPreview message={preview.message} />
                <p className={`text-xs font-medium ${preview.message.includes(STOP_LINE) ? 'text-green-700' : 'text-red-600'}`}>
                  {preview.message.includes(STOP_LINE)
                    ? '✓ Includes “Reply STOP to opt out.”'
                    : '✗ Missing STOP line — batch send is blocked'}
                </p>
                <p className={`text-xs font-medium ${preview.compliant ? 'text-green-700' : 'text-red-600'}`}>
                  {preview.compliant
                    ? '✓ Proposal URL is the last line'
                    : '✗ Message is not compliant — batch send is blocked'}
                </p>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={previewConfirmed}
                    onChange={e => setPreviewConfirmed(e.target.checked)}
                    disabled={!preview.compliant}
                    className="mt-0.5"
                  />
                  I reviewed this exact message. QUO will receive the same STOP line and final proposal URL.
                </label>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendBatch}
                disabled={sending || !preview?.compliant || !previewConfirmed}
                className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {sending ? 'Sending…' : `Send ${batchSize.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
