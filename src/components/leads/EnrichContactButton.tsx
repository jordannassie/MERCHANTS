'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CheckCircle2, XCircle, AlertCircle, ExternalLink } from 'lucide-react'
import type { PlaceCandidate } from '@/lib/google-places'

interface Props {
  leadId: string
  hasGooglePlaceId: boolean
  enrichmentStatus?: string | null
}

interface ReviewCandidate extends PlaceCandidate {
  confidence: number
}

export function EnrichContactButton({ leadId, hasGooglePlaceId, enrichmentStatus }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    status: string
    error?: string
    googleSearchUrl?: string
    candidates?: ReviewCandidate[]
  } | null>(null)
  const [showReview, setShowReview] = useState(false)
  const [saving, setSaving] = useState(false)

  async function findContact(force = false) {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/enrich/find-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, forceRefresh: force }),
      })
      const data = await res.json()
      setResult(data)
      if (data.status === 'review') setShowReview(true)
      if (data.status === 'found') router.refresh()
    } catch (e) {
      setResult({ status: 'error', error: String(e) })
    } finally {
      setLoading(false)
    }
  }

  async function saveCandidate(candidate: ReviewCandidate) {
    setSaving(true)
    try {
      await fetch('/api/enrich/save-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          placeId: candidate.id,
          phone: candidate.nationalPhoneNumber,
          internationalPhone: candidate.internationalPhoneNumber,
          website: candidate.websiteUri,
          googleMapsUri: candidate.googleMapsUri,
          businessStatus: candidate.businessStatus,
          primaryType: candidate.primaryType,
          confidence: candidate.confidence,
        }),
      })
      setShowReview(false)
      setResult(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const alreadyDone = hasGooglePlaceId && enrichmentStatus === 'completed'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => findContact(alreadyDone)}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border
            ${loading
              ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-wait'
              : alreadyDone
              ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            }`}
        >
          <Search size={12} className={loading ? 'animate-pulse' : ''} />
          {loading ? 'Searching…' : alreadyDone ? 'Re-search Contact' : 'Find Contact'}
        </button>

        {result?.status === 'not_found' && result.googleSearchUrl && (
          <a
            href={result.googleSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            Search Google <ExternalLink size={10} />
          </a>
        )}
      </div>

      {/* Result feedback */}
      {result && !showReview && (
        <div className={`text-xs px-3 py-2 rounded-lg flex items-start gap-2 ${
          result.status === 'found' ? 'bg-green-50 text-green-700' :
          result.status === 'already_enriched' ? 'bg-gray-50 text-gray-600' :
          result.status === 'not_found' ? 'bg-amber-50 text-amber-700' :
          'bg-red-50 text-red-700'
        }`}>
          {result.status === 'found' && <CheckCircle2 size={12} className="mt-0.5 shrink-0" />}
          {result.status === 'not_found' && <XCircle size={12} className="mt-0.5 shrink-0" />}
          {result.status === 'error' && <AlertCircle size={12} className="mt-0.5 shrink-0" />}
          <span>
            {result.status === 'found' && 'Contact information saved!'}
            {result.status === 'already_enriched' && 'Already enriched. Click Re-search to refresh.'}
            {result.status === 'not_found' && 'No matching business found in Google Places.'}
            {result.status === 'error' && (result.error ?? 'Search failed.')}
          </span>
        </div>
      )}

      {/* Review dialog */}
      {showReview && result?.candidates && result.candidates.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertCircle size={14} />
            Review match — confidence below 85%
          </div>
          <p className="text-xs text-amber-700">
            These results need your approval. Confirm the address matches before saving.
          </p>
          {result.candidates.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-amber-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{c.displayName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.formattedAddress}</p>
                  {c.nationalPhoneNumber && (
                    <p className="text-xs text-blue-600 mt-0.5">{c.nationalPhoneNumber}</p>
                  )}
                  {c.websiteUri && (
                    <p className="text-xs text-blue-600 mt-0.5 truncate max-w-xs">{c.websiteUri}</p>
                  )}
                </div>
                <span className={`text-xs font-bold shrink-0 ${c.confidence >= 75 ? 'text-green-600' : 'text-amber-600'}`}>
                  {c.confidence}%
                </span>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => saveCandidate(c)}
                  disabled={saving}
                  className="text-xs px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save this match'}
                </button>
                <a
                  href={c.googleMapsUri ?? `https://maps.google.com/?q=${encodeURIComponent(c.formattedAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
                >
                  Verify on Maps <ExternalLink size={9} />
                </a>
              </div>
            </div>
          ))}
          <button
            onClick={() => setShowReview(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
