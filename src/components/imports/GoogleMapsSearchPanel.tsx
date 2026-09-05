'use client'

import { useState, useEffect } from 'react'
import { Search, ExternalLink, CheckCircle2, Plus, Loader2, AlertCircle, RefreshCw, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import type { GooglePlacePreview } from '@/lib/types'

// ── Texas metros for sweep mode ───────────────────────────────────────────────
const TX_METROS = [
  { id: 'dfw',        label: 'Dallas–Fort Worth' },
  { id: 'houston',    label: 'Houston' },
  { id: 'austin',     label: 'Austin' },
  { id: 'san_antonio',label: 'San Antonio' },
  { id: 'el_paso',    label: 'El Paso' },
  { id: 'mcallen',    label: 'McAllen' },
  { id: 'corpus',     label: 'Corpus Christi' },
  { id: 'lubbock',    label: 'Lubbock' },
  { id: 'waco',       label: 'Waco' },
  { id: 'tyler',      label: 'Tyler' },
  { id: 'amarillo',   label: 'Amarillo' },
  { id: 'abilene',    label: 'Abilene' },
  { id: 'midland',    label: 'Midland–Odessa' },
  { id: 'beaumont',   label: 'Beaumont' },
  { id: 'college',    label: 'College Station' },
] as const

// ── Persistence key ───────────────────────────────────────────────────────────
const SWEEP_KEY = 'merchant_radar_sweep_state'

interface SweepState {
  sweepId: string
  query: string
  state: string
  selectedMetros: string[]
  completedMetros: string[]   // metro ids that finished
  totalNew: number
  totalEnriched: number
  startedAt: string
}

function loadSweepState(): SweepState | null {
  try {
    const raw = localStorage.getItem(SWEEP_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveSweepState(s: SweepState) {
  try { localStorage.setItem(SWEEP_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
function clearSweepState() {
  try { localStorage.removeItem(SWEEP_KEY) } catch { /* ignore */ }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface RunLog {
  id: string
  query: string
  location: string | null
  state: string
  results_found: number
  new_leads: number
  enriched_leads: number
  started_at: string
}

type SearchMode = 'single' | 'sweep'
type Phase = 'idle' | 'searching' | 'preview' | 'importing' | 'sweeping' | 'done' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────
function sourceBadge(src: string | null) {
  if (!src) return null
  if (src === 'both')   return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">🏛📍 STATE + MAPS</span>
  if (src === 'google') return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">📍 MAPS</span>
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600">🏛 STATE</span>
}

export function GoogleMapsSearchPanel() {
  // ── Mode ─────────────────────────────────────────────────────────────────
  const [searchMode, setSearchMode] = useState<SearchMode>('single')

  // ── Single-city form state ────────────────────────────────────────────────
  const [stateVal,  setStateVal]  = useState('TX')
  const [location,  setLocation]  = useState('')
  const [queryVal,  setQueryVal]  = useState('')
  const [zip,       setZip]       = useState('')

  // ── Sweep state ───────────────────────────────────────────────────────────
  const [sweepMetros,   setSweepMetros]   = useState<string[]>(TX_METROS.map(m => m.id))
  const [activeSweep,   setActiveSweep]   = useState<SweepState | null>(null)
  const [sweepLog,      setSweepLog]      = useState<string[]>([])      // per-city status lines
  const [sweepError,    setSweepError]    = useState<string | null>(null)

  // ── Single-city result state ──────────────────────────────────────────────
  const [phase,        setPhase]        = useState<Phase>('idle')
  const [error,        setError]        = useState<string | null>(null)
  const [results,      setResults]      = useState<GooglePlacePreview[]>([])
  const [nextToken,    setNextToken]    = useState<string | null>(null)
  const [textQuery,    setTextQuery]    = useState('')
  const [importResult, setImportResult] = useState<{ new_leads: number; enriched_leads: number; skipped: number } | null>(null)
  const [runLog,       setRunLog]       = useState<RunLog[]>([])

  // ── Restore in-progress sweep from localStorage ───────────────────────────
  useEffect(() => {
    const saved = loadSweepState()
    if (saved && saved.completedMetros.length < saved.selectedMetros.length) {
      setActiveSweep(saved)
      setQueryVal(saved.query)
      setSearchMode('sweep')
      setSweepMetros(saved.selectedMetros)
    }
  }, [])

  // ── Single-city search ────────────────────────────────────────────────────
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
    if (!res.ok || data.error) { setError(data.error ?? 'Search failed'); setPhase('error'); return }
    setResults(data.results ?? [])
    setNextToken(data.nextPageToken ?? null)
    setTextQuery(data.text_query ?? '')
    setPhase('preview')
  }

  async function handleLoadMore() {
    if (!nextToken) return
    setPhase('searching')
    const res = await fetch('/api/import/google-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: stateVal, location, query: queryVal, zip, pageToken: nextToken }),
    })
    const data = await res.json() as { results?: GooglePlacePreview[]; nextPageToken?: string; error?: string }
    if (!res.ok || data.error) { setError(data.error ?? 'Load more failed'); setPhase('error'); return }
    setResults(prev => [...prev, ...(data.results ?? [])])
    setNextToken(data.nextPageToken ?? null)
    setPhase('preview')
  }

  async function handleImport() {
    setPhase('importing')
    setError(null)
    const res = await fetch('/api/import/google-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results, state: stateVal, location, query: queryVal, zip }),
    })
    const data = await res.json() as { run_id?: string; new_leads?: number; enriched_leads?: number; skipped?: number; error?: string }
    if (!res.ok || data.error) { setError(data.error ?? 'Import failed'); setPhase('error'); return }
    setImportResult({ new_leads: data.new_leads ?? 0, enriched_leads: data.enriched_leads ?? 0, skipped: data.skipped ?? 0 })
    setRunLog(prev => [{
      id: data.run_id ?? '',
      query: queryVal, location: location || null, state: stateVal,
      results_found: results.length,
      new_leads: data.new_leads ?? 0,
      enriched_leads: data.enriched_leads ?? 0,
      started_at: new Date().toISOString(),
    }, ...prev])
    setPhase('done')
  }

  // ── Sweep: single city helper ─────────────────────────────────────────────
  async function searchAndImportCity(city: string, query: string): Promise<{ new_leads: number; enriched_leads: number; error?: string }> {
    // Search
    const sRes = await fetch('/api/import/google-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'TX', location: city, query }),
    })
    const sData = await sRes.json() as { results?: GooglePlacePreview[]; error?: string }
    if (!sRes.ok || sData.error) return { new_leads: 0, enriched_leads: 0, error: sData.error ?? 'Search failed' }
    const cityResults = sData.results ?? []
    if (cityResults.length === 0) return { new_leads: 0, enriched_leads: 0 }

    // Import
    const iRes = await fetch('/api/import/google-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: cityResults, state: 'TX', location: city, query }),
    })
    const iData = await iRes.json() as { new_leads?: number; enriched_leads?: number; error?: string }
    if (!iRes.ok || iData.error) return { new_leads: 0, enriched_leads: 0, error: iData.error ?? 'Import failed' }
    return { new_leads: iData.new_leads ?? 0, enriched_leads: iData.enriched_leads ?? 0 }
  }

  // ── Sweep: start or resume ────────────────────────────────────────────────
  async function handleStartSweep() {
    if (!queryVal.trim()) return

    const sweepId = `sweep_${Date.now()}`
    const initialState: SweepState = {
      sweepId,
      query: queryVal,
      state: 'TX',
      selectedMetros: sweepMetros,
      completedMetros: [],
      totalNew: 0,
      totalEnriched: 0,
      startedAt: new Date().toISOString(),
    }
    saveSweepState(initialState)
    setActiveSweep(initialState)
    setSweepLog([])
    setSweepError(null)
    setPhase('sweeping')

    await runSweep(initialState)
  }

  async function handleResumeSweep() {
    if (!activeSweep) return
    setSweepError(null)
    setPhase('sweeping')
    await runSweep(activeSweep)
  }

  async function runSweep(sweep: SweepState) {
    const remaining = sweep.selectedMetros.filter(id => !sweep.completedMetros.includes(id))
    let current = { ...sweep }

    for (const metroId of remaining) {
      const metro = TX_METROS.find(m => m.id === metroId)
      if (!metro) continue

      setSweepLog(prev => [...prev, `🔍 Searching ${metro.label}…`])

      const { new_leads, enriched_leads, error: cityErr } = await searchAndImportCity(metro.label, current.query)

      if (cityErr) {
        setSweepLog(prev => [...prev, `⚠️ ${metro.label}: ${cityErr}`])
        // Don't abort — continue to next city
      } else {
        setSweepLog(prev => [...prev, `✅ ${metro.label}: +${new_leads} new, ~${enriched_leads} enriched`])
      }

      // Mark this metro complete and persist progress
      current = {
        ...current,
        completedMetros: [...current.completedMetros, metroId],
        totalNew:       current.totalNew + new_leads,
        totalEnriched:  current.totalEnriched + enriched_leads,
      }
      setActiveSweep(current)
      saveSweepState(current)

      // Brief pause between cities to be polite to the Places API
      await new Promise(r => setTimeout(r, 300))
    }

    // All done
    clearSweepState()
    setSweepLog(prev => [...prev, `🏁 Sweep complete — ${current.totalNew} new leads, ${current.totalEnriched} enriched`])
    setPhase('done')
  }

  function handleCancelSweep() {
    clearSweepState()
    setActiveSweep(null)
    setSweepLog([])
    setPhase('idle')
  }

  // ── Sweep metro toggles ───────────────────────────────────────────────────
  function toggleMetro(id: string) {
    setSweepMetros(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }
  function selectAllMetros() { setSweepMetros(TX_METROS.map(m => m.id)) }
  function clearAllMetros()  { setSweepMetros([]) }

  // ── Derived counts ────────────────────────────────────────────────────────
  const matched   = results.filter(r => r.matched_lead_id)
  const unmatched = results.filter(r => !r.matched_lead_id)
  const sweepDone = activeSweep?.completedMetros.length ?? 0
  const sweepTotal = activeSweep?.selectedMetros.length ?? sweepMetros.length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Google Maps Business Search</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Search Google Places, preview results, and import new leads or enrich existing ones.
        </p>
      </div>

      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { val: 'single', label: '📍 Single City' },
          { val: 'sweep',  label: '🗺️ All Texas Sweep' },
        ] as const).map(({ val, label }) => (
          <button
            key={val}
            onClick={() => { setSearchMode(val); setPhase('idle'); setError(null); setResults([]) }}
            disabled={phase === 'sweeping'}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-all ${
              searchMode === val
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SINGLE CITY MODE */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {searchMode === 'single' && (
        <>
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                <input value={stateVal} onChange={e => setStateVal(e.target.value.toUpperCase())} maxLength={2} placeholder="TX"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Metro / City</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Houston"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Category / Search phrase <span className="text-red-500">*</span>
                </label>
                <input value={queryVal} onChange={e => setQueryVal(e.target.value)} placeholder="restaurants, nail salon, auto repair…" required
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ZIP (optional)</label>
                <input value={zip} onChange={e => setZip(e.target.value)} placeholder="77001" maxLength={5}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <button type="submit" disabled={phase === 'searching' || phase === 'importing'}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {phase === 'searching' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {phase === 'searching' ? 'Searching…' : 'Search Google Maps'}
            </button>
          </form>

          {phase === 'error' && error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          {(phase === 'preview' || phase === 'done') && results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm text-gray-700">
                  <span className="font-semibold">{results.length}</span> results for{' '}
                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{textQuery}</span>
                  {' — '}
                  <span className="text-green-700 font-medium">{matched.length} match existing</span>
                  {' · '}
                  <span className="text-blue-700 font-medium">{unmatched.length} new</span>
                </div>
                {phase === 'preview' && (
                  <button onClick={handleImport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    <Plus size={14} />
                    Import {unmatched.length} new · enrich {matched.length}
                  </button>
                )}
              </div>

              {phase === 'done' && importResult && (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                  <p className="font-semibold mb-1">Import complete</p>
                  <ul className="space-y-0.5 text-green-700">
                    <li>✅ {importResult.new_leads} new Google leads added</li>
                    <li>🔗 {importResult.enriched_leads} existing leads enriched with Google data</li>
                    {importResult.skipped > 0 && <li>⚠️ {importResult.skipped} skipped</li>}
                  </ul>
                </div>
              )}

              <ResultsTable results={results} />

              {nextToken && phase === 'preview' && (
                <button onClick={handleLoadMore} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  <RefreshCw size={13} />Load next 20 results
                </button>
              )}
            </div>
          )}

          {phase === 'preview' && results.length === 0 && (
            <p className="text-sm text-gray-500">No results found. Try a different search term or location.</p>
          )}
          {phase === 'importing' && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 size={14} className="animate-spin" />Saving results to database…
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ALL TEXAS SWEEP MODE */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {searchMode === 'sweep' && (
        <div className="space-y-4">
          {/* Explanation */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><MapPin size={14} />All Texas Sweep</p>
            <p className="text-blue-700 text-xs">
              Searches Texas city-by-city and category-by-category. Results are deduplicated against your existing queue using phone number → Google Place ID → name + address priority. Progress is saved after each city — a timeout or refresh will not restart the sweep.
            </p>
            <p className="text-blue-600 text-xs italic">
              Note: This finds Google Places results across selected Texas metros, not every business in Texas.
            </p>
          </div>

          {/* Query input */}
          <div className="max-w-md">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Category / Search phrase <span className="text-red-500">*</span>
            </label>
            <input
              value={queryVal}
              onChange={e => setQueryVal(e.target.value)}
              placeholder="restaurants, nail salons, auto repair…"
              disabled={phase === 'sweeping'}
              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
          </div>

          {/* Metro selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Select Texas metros ({sweepMetros.length} of {TX_METROS.length} selected)</label>
              <div className="flex gap-2">
                <button onClick={selectAllMetros} className="text-[10px] text-blue-600 hover:underline">All</button>
                <button onClick={clearAllMetros}  className="text-[10px] text-gray-400 hover:underline">None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {TX_METROS.map(metro => {
                const isDone = activeSweep?.completedMetros.includes(metro.id) ?? false
                const isSelected = sweepMetros.includes(metro.id)
                return (
                  <label key={metro.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      isDone         ? 'bg-green-50 border-green-200 text-green-700' :
                      isSelected     ? 'bg-blue-50 border-blue-300 text-blue-800' :
                                       'bg-white border-gray-200 text-gray-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMetro(metro.id)}
                      disabled={phase === 'sweeping' || isDone}
                      className="accent-blue-600"
                    />
                    {isDone ? '✅ ' : ''}{metro.label}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Sweep controls */}
          {phase !== 'sweeping' && (
            <div className="flex items-center gap-3 flex-wrap">
              {activeSweep && activeSweep.completedMetros.length > 0 && activeSweep.completedMetros.length < activeSweep.selectedMetros.length ? (
                <>
                  <button onClick={handleResumeSweep} disabled={!queryVal.trim() || sweepMetros.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors">
                    <RefreshCw size={14} />
                    Resume sweep ({sweepDone}/{sweepTotal} done)
                  </button>
                  <button onClick={handleCancelSweep}
                    className="text-sm text-gray-400 hover:text-red-500 transition-colors">
                    Start over
                  </button>
                </>
              ) : (
                <button onClick={handleStartSweep} disabled={!queryVal.trim() || sweepMetros.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <MapPin size={14} />
                  Start Texas Sweep ({sweepMetros.length} metros)
                </button>
              )}
            </div>
          )}

          {/* Sweep progress bar */}
          {phase === 'sweeping' && activeSweep && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-blue-500" />
                  {sweepDone} of {sweepTotal} Texas metros complete
                </span>
                <span className="text-gray-500 text-xs">
                  +{activeSweep.totalNew} new · ~{activeSweep.totalEnriched} enriched
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${sweepTotal > 0 ? (sweepDone / sweepTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Sweep done summary */}
          {phase === 'done' && activeSweep === null && sweepLog.length > 0 && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold">Texas Sweep complete</p>
              <p className="text-green-700 text-xs mt-0.5">Progress saved and cleared — ready for next sweep.</p>
            </div>
          )}

          {/* Sweep log */}
          {sweepLog.length > 0 && (
            <div className="bg-gray-50 rounded-xl border border-gray-100 px-3 py-2 max-h-52 overflow-y-auto space-y-0.5">
              {sweepLog.map((line, i) => (
                <p key={i} className="text-xs font-mono text-gray-600">{line}</p>
              ))}
            </div>
          )}

          {sweepError && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />{sweepError}
            </div>
          )}
        </div>
      )}

      {/* ── Session run log (single city) ── */}
      {runLog.length > 0 && searchMode === 'single' && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">This session&apos;s runs</p>
          <div className="space-y-1.5">
            {runLog.map(run => (
              <div key={run.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-medium">&quot;{run.query}&quot; in {run.location ?? run.state}</span>
                <span className="text-gray-400 font-mono">{run.results_found} found · +{run.new_leads} new · ~{run.enriched_leads} enriched</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Results preview table ─────────────────────────────────────────────────────
function ResultsTable({ results }: { results: GooglePlacePreview[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <span>Preview ({results.length} results)</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Business</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Address</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Phone</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Match</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {results.map((r, i) => (
              <tr key={r.place_id ?? i} className={r.matched_lead_id ? 'bg-green-50/40' : 'bg-white'}>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-900 text-xs leading-snug">{r.name}</div>
                  {r.matched_lead_id && sourceBadge('both')}
                  <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:underline mt-0.5">
                    Maps <ExternalLink size={9} />
                  </a>
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <div className="text-xs text-gray-500 leading-snug">{r.formatted_address}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-xs font-mono text-gray-700">{r.phone ?? '—'}</div>
                </td>
                <td className="px-3 py-2.5">
                  {r.matched_lead_id ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 size={10} />
                      {r.match_type === 'phone' ? 'Phone' : r.match_type === 'place_id' ? 'Place ID' : 'Name+addr'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">
                      <Plus size={10} />New
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
