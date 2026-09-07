'use client'

import { useState } from 'react'

interface Props {
  enabled: boolean
}

export function SalesFollowupToggle({ enabled: initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/sales-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })
      if (res.ok) {
        setEnabled(prev => !prev)
      } else {
        console.error('[SalesFollowupToggle] Failed to update setting')
      }
    } catch (err) {
      console.error('[SalesFollowupToggle] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">Sales Follow-up System</h2>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                enabled
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-400'}`}
              />
              {enabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {enabled
              ? 'Automated follow-up messages will be sent daily at 10:00 AM CT.'
              : 'Turn on to automatically send follow-up messages to leads in sequence.'}
          </p>
        </div>

        <button
          onClick={toggle}
          disabled={loading}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
            enabled
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? '…' : enabled ? 'Turn Off' : 'Turn On'}
        </button>
      </div>
    </div>
  )
}
