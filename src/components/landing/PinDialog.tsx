'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Crosshair } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

/** Outer shell — when open=false the inner content unmounts and resets state cleanly. */
export function PinDialog({ open, onClose }: Props) {
  if (!open) return null
  return <PinContent onClose={onClose} />
}

type Phase = 'idle' | 'loading' | 'error' | 'rate_limited' | 'config_error'

function PinContent({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the PIN input on mount — focusing an element is an external system interaction
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit() {
    if (pin.length === 0 || phase === 'loading') return
    setPhase('loading')
    setMessage('')

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      let body: Record<string, unknown> = {}
      try {
        body = (await res.json()) as Record<string, unknown>
      } catch { /* non-JSON */ }

      if (res.ok) {
        // Navigate to dashboard after successful login
        router.push('/dashboard')
        router.refresh()
        return
      }

      const err = String(body.error ?? '')
      const msg = String(body.message ?? 'Something went wrong.')

      if (err === 'rate_limited') {
        setPhase('rate_limited')
        setMessage(msg)
      } else if (err === 'config_error') {
        setPhase('config_error')
        setMessage(msg)
      } else {
        setPhase('error')
        setMessage('Incorrect PIN. Please try again.')
        setPin('')
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    } catch {
      setPhase('error')
      setMessage('Network error. Please try again.')
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit()
  }

  const isLoading = phase === 'loading'
  const isBlocked = phase === 'rate_limited' || phase === 'config_error'

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal
      aria-label="Admin login"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Crosshair size={18} className="text-blue-600" />
            <span className="font-semibold text-gray-900">Merchant Radar Admin</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-6 text-center">
          Enter your admin PIN to access the dashboard.
        </p>

        {/* PIN input — inputmode="numeric" for mobile numeric keypad */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          value={pin}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '')
            setPin(v)
            if (phase === 'error') setPhase('idle')
          }}
          onKeyDown={handleKey}
          placeholder="••••"
          maxLength={12}
          disabled={isBlocked}
          className="w-full text-center text-3xl tracking-[0.4em] font-mono rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none px-4 py-4 mb-4 bg-gray-50 disabled:opacity-50"
          aria-label="Admin PIN"
        />

        {/* Error / status messages */}
        {phase === 'error' && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4 text-center">
            {message}
          </p>
        )}
        {phase === 'rate_limited' && (
          <p className="text-sm text-orange-700 bg-orange-50 rounded-lg px-3 py-2 mb-4 text-center">
            {message}
          </p>
        )}
        {phase === 'config_error' && (
          <p className="text-sm text-yellow-800 bg-yellow-50 rounded-lg px-3 py-2 mb-4 text-center">
            {message}
          </p>
        )}

        {/* Submit */}
        <button
          onClick={submit}
          disabled={pin.length === 0 || isLoading || isBlocked}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Verifying…' : 'Enter'}
        </button>
      </div>
    </div>
  )
}
