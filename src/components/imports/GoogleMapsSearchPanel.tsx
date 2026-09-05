'use client'

import { useState } from 'react'
import { Search, ExternalLink, CheckCircle2, Plus, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import type { GooglePlacePreview } from '@/lib/types'

interface SearchRunLog {
  id: string
  query: string
  location: string | null
  state: string
  results_found: number
  new_leads: number
  enriched_leads: number
  started_at: string
  completed_at: string | null
}

type Phase = 'idle' | 'searching' | 'preview' | 'importing' | 'done' | 'error'

export function GoogleMapsSearchPanel() {
  // Form state
  const [stateVal,    setStateVal]    = useState('TX')
  const [location,    setLocation]    = useState('')
  const [queryVal,    setQueryVal]    = useState('')
  const [zip,         setZip]         = useState('')

  // Results state
  const [phase,        setPhase]        = useState<Phase>('idle')
  const [error,        setError]        = useState<string | null>(null)
  const [results,      setResults]      = useState<GooglePlacePreview[]>([])
  const [nextToken,    setNextToken]    = useState<string | null>(null)
  const [textQuery,    setTextQuery]    = useState('')
  const [importResult, setImportResult] = useState<{ new_leads: number; enriched_leads: number; skipped: number } | null>(null)
  const [runLog,       setRunLog]       = useState<SearchRunLog[]>([])

  // ── Search ────────────────────────────────────────────────────────────────
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!queryVal.trim()) return

    setPhase('searching')
    setError(null)
    setResults([])
    setNextToken(null)
    setImportResult(null)

    const res = await fetch('/api/import/google-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: stateVal, location, query: queryVal, zip }),
    })
    const data = await res.json() as { results?: GooglePlacePreview[]; nextPageToken?: string; text_query?: string; error?: string }

    if (!res.ok || data.error) {
      setError(data.error ?? 'Search failed')
      setPhase('error')
      return
    }

    setResults(data.results ?? [])
    setNextToken(data.nextPageToken ?? null)
    setTextQuery(data.text_query ?? '')
    setPhase('preview')
  }

  // ── Load more pages ───────────────────────────────────────────────────────
  async function handleLoadMore() {
    if (!nextToken) return
    setPhase('searching')

    const res = await fetch('/api/import/google-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: stateVal, location, query: queryVal, zip, pageToken: nextToken }),
    })
    const data = await res.json() as { results?: GooglePlacePreview[]; nextPageToken?: string; error?: string }

    if (!res.ok || data.error) {
      setError(data.error ?? 'Load more failed')
      setPhase('error')
      return
    }

    setResults(prev => [...prev, ...(data.results ?? [])])
    setNextToken(data.nextPageToken ?? null)
    setPhase('preview')
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function handleImport() {
    setPhase('importing')
    setError(null)

    const res = await fetch('/api/import/google-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results, state: stateVal, location, query: queryVal, zip }),
    })
    const data = await res.json() as { run_id?: string; new_leads?: number; enriched_leads?: number; skipped?: number; error?: string }

    if (!res.ok || data.error) {
      setError(data.error ?? 'Import failed')
      setPhase('error')
      return
    }

    setImportResult({
      new_leads:      data.new_leads      ?? 0,
      enriched_leads: data.enriched_leads ?? 0,
      skipped:        data.skipped        ?? 0,
    })

    // Add to local run log
    setRunLog(prev => [{
      id:             data.run_id ?? '',
      query:          queryVal,
      location:       location || null,
      state:          stateVal,
      results_found:  results.length,
      new_leads:      data.new_leads      ?? 0,
      enriched_leads: data.enriched_leads ?? 0,
      started_at:     new Date().toISOString(),
      completed_at:   new Date().toISOString(),
    }, ...prev])

    setPhase('done')
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const matched   = results.filter(r => r.matched_lead_id)
  const unmatched = results.filter(r => !r.matched_lead_id)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Google Maps Business Search</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Search Google Places, preview results, and import new leads or enrich existing ones.
        </p>
      </div>

      {/* ── Search form ── */}
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
            <input
              value={stateVal}
              onChange={e => setStateVal(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="TX"
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Metro / City</label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Houston"
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Category / Search phrase <span className="text-red-500">*</span>
            </label>
            <input
              value={queryVal}
              onChange={e => setQueryVal(e.target.value)}
              placeholder="restaurants, nail salon, auto repair…"
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ZIP (optional)</label>
            <input
              value={zip}
              onChange={e => setZip(e.target.value)}
              placeholder="77001"
              maxLength={5}
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={phase === 'searching' || phase === 'importing'}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {phase === 'searching' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {phase === 'searching' ? 'Searching…' : 'Search Google Maps'}
        </button>
      </form>

      {/* ── Error ── */}
      {phase === 'error' && error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Preview results ── */}
      {(phase === 'preview' || phase === 'done') && results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">{results.length}</span> results for{' '}
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{textQuery}</span>
              {' — '}
              <span className="text-green-700 font-medium">{matched.length} match existing leads</span>
              {' · '}
              <span className="text-blue-700 font-medium">{unmatched.length} new</span>
            </div>
            {phase === 'preview' && (
              <button
                onClick={handleImport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus size={14} />
                Import {unmatched.length} new · enrich {matched.length}
              </button>
            )}
          </div>

          {/* Import success summary */}
          {phase === 'done' && importResult && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold mb-1">Import complete</p>
              <ul className="space-y-0.5 text-green-700">
                <li>✅ {importResult.new_leads} new Google leads added</li>
                <li>🔗 {importResult.enriched_leads} existing leads enriched with Google data</li>
                {importResult.skipped > 0 && <li>⚠️ {importResult.skipped} skipped (already imported or error)</li>}
              </ul>
            </div>
          )}

          {/* Results table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Business</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Address</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Phone</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">Website</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {results.map((r, i) => (
                  <tr key={r.place_id ?? i} className={r.matched_lead_id ? 'bg-green-50/40' : 'bg-white'}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-900 text-xs leading-snug">{r.name}</div>
                      <a
                        href={r.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:underline mt-0.5"
                      >
                        Maps <ExternalLink size={9} />
                      </a>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <div className="text-xs text-gray-500 leading-snug">{r.formatted_address}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-xs font-mono text-gray-700">{r.phone ?? '—'}</div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      {r.website ? (
                        <a href={r.website} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5">
                          {new URL(r.website).hostname.replace(/^www\./, '')} <ExternalLink size={9} />
                        </a>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.matched_lead_id ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 size={10} />
                          {r.match_type === 'phone' ? 'Phone match' : r.match_type === 'place_id' ? 'Place ID' : 'Name+addr'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                          <Plus size={10} />
                          New lead
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {nextToken && phase === 'preview' && (
            <button
              onClick={handleLoadMore}
              disabled={phase !== 'preview'}
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <RefreshCw size={13} />
              Load next 20 results
            </button>
          )}
        </div>
      )}

      {/* No results */}
      {phase === 'preview' && results.length === 0 && (
        <p className="text-sm text-gray-500">No results found. Try a different search term or location.</p>
      )}

      {/* Importing spinner */}
      {phase === 'importing' && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 size={14} className="animate-spin" />
          Saving results to database…
        </div>
      )}

      {/* Run log */}
      {runLog.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">This session&apos;s runs</p>
          <div className="space-y-1.5">
            {runLog.map(run => (
              <div key={run.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-medium">&quot;{run.query}&quot; in {run.location ?? run.state}</span>
                <span className="text-gray-400 font-mono">
                  {run.results_found} found · +{run.new_leads} new · ~{run.enriched_leads} enriched
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
