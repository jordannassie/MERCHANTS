'use client'

/**
 * GoogleMapsSearchPanel
 *
 * Simple two-mode UI for finding callable Google Maps leads.
 * User-facing interface is intentionally minimal:
 *   • All Texas Sweep — one button, runs all metros + all internal categories
 *   • Single City     — enter a city, runs all internal categories for it
 *
 * Categories/phrases are never exposed to the user.
 * A business is only imported as a lead when it has: name + valid US phone + TX location.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, Loader2, AlertCircle, ChevronDown, ChevronUp, MapPin, CheckCircle2 } from 'lucide-react'
import { generateSweepTasks, getAllPhrases, TX_SWEEP_METROS, type SweepTask } from '@/lib/google-categories'
import type { GooglePlacePreview } from '@/lib/types'

// ── localStorage persistence ─────────────────────────────────────────────────
const SWEEP_KEY = 'merchant_radar_sweep_v2'

interface SweepSession {
  id: string
  mode: 'sweep' | 'city'
  city?: string
  tasks: SweepTask[]       // full ordered list (city mode: one city × all phrases)
  taskIndex: number        // next task to run
  // Metrics
  checked: number          // raw Google results seen
  callable: number         // with valid phone
  newLeads: number
  enriched: number
  dupSkipped: number
  noPhone: number
  startedAt: string
  status: 'running' | 'paused' | 'done'
}

function loadSession(): SweepSession | null {
  try { return JSON.parse(localStorage.getItem(SWEEP_KEY) ?? 'null') } catch { return null }
}
function saveSession(s: SweepSession) {
  try { localStorage.setItem(SWEEP_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}
function clearSession() {
  try { localStorage.removeItem(SWEEP_KEY) } catch { /* ignore */ }
}

// ── Types ────────────────────────────────────────────────────────────────────
type Mode = 'sweep' | 'city'

interface Metrics {
  checked:   number
  callable:  number
  newLeads:  number
  enriched:  number
  dupSkipped: number
  noPhone:   number
}

const EMPTY_METRICS: Metrics = { checked: 0, callable: 0, newLeads: 0, enriched: 0, dupSkipped: 0, noPhone: 0 }

// ── Panel ────────────────────────────────────────────────────────────────────
export function GoogleMapsSearchPanel() {
  const [mode, setMode] = useState<Mode>('sweep')

  // City mode
  const [city, setCity] = useState('')

  // Advanced: manual phrase override
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advancedPhrase, setAdvancedPhrase] = useState('')

  // Sweep state
  const [session, setSession]   = useState<SweepSession | null>(null)
  const [metrics, setMetrics]   = useState<Metrics>(EMPTY_METRICS)
  const [running, setRunning]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [lastLog, setLastLog]   = useState<string[]>([])   // last 6 status lines
  const [completed, setCompleted] = useState(false)
  const [completedReport, setCompletedReport] = useState<Metrics>(EMPTY_METRICS)

  const stopRef = useRef(false)   // signal to break mid-loop

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const saved = loadSession()
    if (saved && saved.status !== 'done') {
      setSession(saved)
      setMetrics({
        checked:   saved.checked,
        callable:  saved.callable,
        newLeads:  saved.newLeads,
        enriched:  saved.enriched,
        dupSkipped: saved.dupSkipped,
        noPhone:   saved.noPhone,
      })
      if (saved.mode === 'city') { setMode('city'); setCity(saved.city ?? '') }
    }
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function pushLog(line: string) {
    setLastLog(prev => [...prev.slice(-5), line])
  }

  /** Call /api/import/google-search then /api/import/google-import for one task. */
  async function runTask(task: SweepTask): Promise<{
    checked: number; callable: number; newLeads: number; enriched: number; dupSkipped: number; noPhone: number
  }> {
    const searchRes = await fetch('/api/import/google-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'TX', location: task.metro, query: task.phrase }),
    }).then(r => r.json())

    if (searchRes.error) throw new Error(searchRes.error)

    const results: GooglePlacePreview[] = searchRes.results ?? []
    const checked:  number = searchRes.checked_count ?? results.length
    const callable: number = searchRes.callable_count ?? results.length
    const noPhone:  number = searchRes.no_phone_count ?? 0

    if (results.length === 0) return { checked, callable: 0, newLeads: 0, enriched: 0, dupSkipped: 0, noPhone }

    const importRes = await fetch('/api/import/google-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results, state: 'TX', location: task.metro, query: task.phrase }),
    }).then(r => r.json())

    if (importRes.error) throw new Error(importRes.error)

    return {
      checked,
      callable,
      newLeads:  importRes.new_leads      ?? 0,
      enriched:  importRes.enriched_leads ?? 0,
      dupSkipped: importRes.skipped_dup   ?? 0,
      noPhone,
    }
  }

  /** Run the sweep loop starting from `startIndex`. Resumes if paused. */
  const runSweep = useCallback(async (tasks: SweepTask[], startIndex: number, initial: Metrics, sessionId: string, sessionMode: Mode, sessionCity?: string) => {
    setRunning(true)
    setError(null)
    stopRef.current = false

    let m = { ...initial }
    let idx = startIndex

    const newSession: SweepSession = {
      id:       sessionId,
      mode:     sessionMode,
      city:     sessionCity,
      tasks,
      taskIndex: idx,
      ...m,
      startedAt: new Date().toISOString(),
      status:   'running',
    }
    setSession(newSession)

    try {
      while (idx < tasks.length) {
        if (stopRef.current) break

        const task = tasks[idx]
        pushLog(`🔍 Searching "${task.phrase}" in ${task.metro}…`)

        try {
          const result = await runTask(task)
          m = {
            checked:   m.checked   + result.checked,
            callable:  m.callable  + result.callable,
            newLeads:  m.newLeads  + result.newLeads,
            enriched:  m.enriched  + result.enriched,
            dupSkipped: m.dupSkipped + result.dupSkipped,
            noPhone:   m.noPhone   + result.noPhone,
          }
          setMetrics({ ...m })
          pushLog(`✅ ${task.metro} / ${task.phrase}: ${result.newLeads} new, ${result.enriched} enriched, ${result.noPhone} no phone`)
        } catch (taskErr) {
          pushLog(`⚠️ ${task.metro} / ${task.phrase}: ${String(taskErr).slice(0, 60)}`)
        }

        idx++

        // Save progress after every task
        const updatedSession: SweepSession = { ...newSession, taskIndex: idx, ...m, status: stopRef.current ? 'paused' : 'running' }
        saveSession(updatedSession)
        setSession(updatedSession)

        // Small delay between tasks to respect rate limits
        if (idx < tasks.length && !stopRef.current) {
          await new Promise(r => setTimeout(r, 600))
        }
      }

      if (!stopRef.current) {
        // All done
        const doneSession: SweepSession = { ...newSession, taskIndex: idx, ...m, status: 'done' }
        saveSession(doneSession)
        setSession(doneSession)
        setCompleted(true)
        setCompletedReport({ ...m })
        pushLog(`🎉 Done! ${m.newLeads} new leads, ${m.enriched} enriched.`)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start All Texas Sweep ─────────────────────────────────────────────────
  function startSweep() {
    const tasks = generateSweepTasks()
    const id = Date.now().toString()
    setCompleted(false)
    setLastLog([])
    setMetrics(EMPTY_METRICS)
    runSweep(tasks, 0, EMPTY_METRICS, id, 'sweep')
  }

  // ── Start Single City search ──────────────────────────────────────────────
  function startCity() {
    const trimmedCity = city.trim()
    if (!trimmedCity) return
    const phrases = advancedPhrase.trim() ? [advancedPhrase.trim()] : getAllPhrases()
    const tasks: SweepTask[] = phrases.map(phrase => ({
      metro: trimmedCity,
      phrase,
      state: 'TX',
      textQuery: `${phrase} ${trimmedCity} TX`,
    }))
    const id = Date.now().toString()
    setCompleted(false)
    setLastLog([])
    setMetrics(EMPTY_METRICS)
    runSweep(tasks, 0, EMPTY_METRICS, id, 'city', trimmedCity)
  }

  // ── Resume paused session ─────────────────────────────────────────────────
  function resumeSession() {
    if (!session) return
    setCompleted(false)
    runSweep(session.tasks, session.taskIndex, metrics, session.id, session.mode, session.city)
  }

  // ── Pause / stop ──────────────────────────────────────────────────────────
  function pauseSweep() {
    stopRef.current = true
  }

  // ── Start fresh (clear saved session) ────────────────────────────────────
  function startFresh() {
    clearSession()
    setSession(null)
    setMetrics(EMPTY_METRICS)
    setLastLog([])
    setCompleted(false)
    setError(null)
  }

  // ── Computed progress ─────────────────────────────────────────────────────
  const tasksTotal     = session?.tasks.length ?? 0
  const tasksDone      = session ? Math.min(session.taskIndex, tasksTotal) : 0
  const progressPct    = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0
  const isPaused       = session?.status === 'paused'
  const hasSavedSession = !!session && session.status !== 'done'

  // Which metro are we currently on?
  const currentTask = session ? session.tasks[session.taskIndex] : null
  const uniqueMetrosDone = session ? new Set(session.tasks.slice(0, tasksDone).map(t => t.metro)).size : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Mode Tabs ─────────────────────────────────────────────────────── */}
      {!running && !hasSavedSession && !completed && (
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setMode('sweep')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'sweep' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🗺️ All Texas Sweep
          </button>
          <button
            onClick={() => setMode('city')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'city' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📍 Single City
          </button>
        </div>
      )}

      {/* ── Resume Banner ─────────────────────────────────────────────────── */}
      {hasSavedSession && !running && !completed && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {session!.mode === 'city'
                ? `📍 Paused city search: ${session!.city}`
                : '🗺️ All Texas Sweep paused'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {tasksDone} of {tasksTotal} combinations done · {metrics.newLeads} new leads · {metrics.enriched} enriched
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={resumeSession}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              Resume
            </button>
            <button
              onClick={startFresh}
              className="px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* ── All Texas Sweep Form ───────────────────────────────────────────── */}
      {mode === 'sweep' && !running && !hasSavedSession && !completed && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">State</p>
            <p className="text-sm text-gray-500 mt-0.5">Texas (TX) — searches {TX_SWEEP_METROS.length} cities across all merchant categories</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700 space-y-1">
            <p>🔍 Automatically searches {TX_SWEEP_METROS.length} Texas metros × all merchant categories</p>
            <p>📞 Only adds businesses with a valid phone number to your leads queue</p>
            <p>♻️ Safe to rerun weekly — skips existing leads, never resets pipeline</p>
          </div>
          <button
            onClick={startSweep}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors"
          >
            🗺️ Find All Texas Businesses
          </button>
        </div>
      )}

      {/* ── Single City Form ──────────────────────────────────────────────── */}
      {mode === 'city' && !running && !hasSavedSession && !completed && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">City</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && city.trim()) startCity() }}
                placeholder="e.g. Houston"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={startCity}
                disabled={!city.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                📍 Find All Businesses in This City
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">All merchant categories searched automatically · Phone required</p>
          </div>

          {/* ── Advanced collapsed ──────────────────────────────────────── */}
          <div className="border-t pt-3">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
            >
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Advanced Search
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-2">
                <label className="text-xs font-medium text-gray-600 block">Override search phrase (optional)</label>
                <input
                  type="text"
                  value={advancedPhrase}
                  onChange={e => setAdvancedPhrase(e.target.value)}
                  placeholder="e.g. taco trucks — leave blank to run all categories"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400">When blank, all internal merchant categories run automatically.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Active Sweep Progress ─────────────────────────────────────────── */}
      {(running || (hasSavedSession && running)) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span className="text-sm font-semibold text-gray-800">
                {session?.mode === 'city' ? `Searching ${session?.city}…` : 'All Texas Sweep running…'}
              </span>
            </div>
            <button
              onClick={pauseSweep}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Pause
            </button>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{tasksDone} of {tasksTotal} searches</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {session?.mode === 'sweep' && currentTask && (
              <p className="text-xs text-gray-400 mt-1">
                Now: {currentTask.metro} — {uniqueMetrosDone} of {TX_SWEEP_METROS.length} cities started
              </p>
            )}
          </div>

          {/* Live metrics */}
          <MetricsGrid m={metrics} />

          {/* Last N log lines */}
          {lastLog.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-0.5">
              {lastLog.map((line, i) => (
                <p key={i} className="text-xs text-gray-500 font-mono">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Paused State (mid-sweep) ─────────────────────────────────────── */}
      {isPaused && !running && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Sweep paused at {tasksDone}/{tasksTotal}</p>
          <MetricsGrid m={metrics} />
          {lastLog.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-0.5">
              {lastLog.map((line, i) => (
                <p key={i} className="text-xs text-gray-500 font-mono">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Search error</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
            <button onClick={startFresh} className="text-xs text-red-600 underline mt-1 hover:text-red-800">
              Start over
            </button>
          </div>
        </div>
      )}

      {/* ── Completion Report ─────────────────────────────────────────────── */}
      {completed && !running && (
        <div className="bg-white border border-green-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <p className="text-sm font-semibold text-green-800">
              {session?.mode === 'city'
                ? `${session?.city} search complete!`
                : 'All Texas Sweep complete!'}
            </p>
          </div>
          <MetricsGrid m={completedReport} highlight />
          <div className="flex gap-2 pt-1">
            <button
              onClick={startFresh}
              className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              {mode === 'sweep' ? '🗺️ Run Again' : '📍 New Search'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Metrics Grid ─────────────────────────────────────────────────────────────
function MetricsGrid({ m, highlight }: { m: Metrics; highlight?: boolean }) {
  const card = (label: string, value: number, color?: string) => (
    <div className={`rounded-lg p-3 text-center ${highlight ? 'bg-green-50' : 'bg-gray-50'}`}>
      <p className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
  return (
    <div className="grid grid-cols-3 gap-2">
      {card('New Leads',     m.newLeads,  'text-green-700')}
      {card('Enriched',      m.enriched,  'text-indigo-700')}
      {card('Dup Skipped',   m.dupSkipped)}
      {card('Checked',       m.checked)}
      {card('With Phone',    m.callable)}
      {card('No Phone',      m.noPhone,   'text-amber-700')}
    </div>
  )
}
