'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

interface Props {
  leadId: string
  onSent?: () => void
}

export function SendNowButton({ leadId, onSent }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/followups/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      })
      const data = await res.json()
      if (data.ok) {
        setDone(true)
        onSent?.()
      } else {
        setError(data.error ?? 'Failed to send')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 bg-green-100 text-green-700 rounded-lg">
        ✓ Sent
      </span>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSend}
        disabled={loading}
        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg disabled:opacity-50 transition-colors"
      >
        <Send size={10} />
        {loading ? 'Sending…' : 'Send Now'}
      </button>
      {error && (
        <p className="text-[10px] text-red-500 max-w-[120px] text-right">{error}</p>
      )}
    </div>
  )
}
