'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flame, CheckCircle2, AlertCircle, XCircle, Loader2, X } from 'lucide-react'

interface BulkResult {
  summary: {
    total: number
    found: number
    review: number
    not_found: number
    error: number
    skipped: number
  }
}

interface HotConfirmProps {
  onConfirm: () => void
  onCancel: () => void
  count?: number
}

function HotConfirmDialog({ onConfirm, onCancel, count }: HotConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <Flame size={18} className="text-orange-500" />
          <h3 className="font-semibold text-gray-900">Find Contacts for Hot Leads</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          This will search Google Places for up to {count ?? 25} hot leads that are missing a phone number. Continue?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Start Search
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export function BulkEnrichBar() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHotConfirm, setShowHotConfirm] = useState(false)

  async function runHotLeads() {
    setShowHotConfirm(false)
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/enrich/find-contacts-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'hot_missing_phone', confirmed: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Enrichment failed')
      } else {
        setResult(data)
        router.refresh()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {showHotConfirm && (
        <HotConfirmDialog
          onConfirm={runHotLeads}
          onCancel={() => setShowHotConfirm(false)}
          count={25}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowHotConfirm(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Flame size={12} />}
          {loading ? 'Searching…' : 'Find Contacts for Hot Leads'}
        </button>

        {result && (
          <div className="flex items-center gap-3 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg">
            <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={11} /> {result.summary.found} found</span>
            {result.summary.review > 0 && (
              <span className="text-amber-600 flex items-center gap-1"><AlertCircle size={11} /> {result.summary.review} needs review</span>
            )}
            {result.summary.not_found > 0 && (
              <span className="text-gray-400 flex items-center gap-1"><XCircle size={11} /> {result.summary.not_found} not found</span>
            )}
            <button onClick={() => setResult(null)} className="text-gray-400 hover:text-gray-600 ml-1">
              <X size={10} />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <AlertCircle size={11} />
            {error}
            <button onClick={() => setError(null)} className="ml-1 text-red-400 hover:text-red-600"><X size={10} /></button>
          </div>
        )}
      </div>
    </>
  )
}
