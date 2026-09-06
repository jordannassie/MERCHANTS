'use client'

/**
 * GoogleMapsSearchPanel
 *
 * Simple control card for the Google Daily Leads automation.
 *
 * Shows:
 *   • ON / OFF toggle
 *   • Today's new callable leads vs. daily goal
 *   • Searches used today
 *   • Current Texas search position (task N of 315)
 *   • Last run / Next scheduled run
 *   • "Run Test" button — fires exactly one search to verify connectivity
 *
 * No category selectors, city selectors, ZIP fields, quantity sliders,
 * or advanced controls. All processing is server-side.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface SweepStatus {
  enabled:                boolean
  api_key_configured:     boolean
  daily_goal:             number
  daily_search_limit:     number
  searches_used_today:    number
  searches_remaining:     number
  new_leads_today:        number
  task_index:             number
  tasks_total:            number
  new_leads_all_time:     number
  enriched_all_time:      number
  last_run_at:            string | null
  last_complete_cycle_at: string | null
  next_run_at:            string
  dup_skipped_today:      number
  error?:                 string
}

interface TestResult {
  ok:                boolean
  quota_exceeded:    boolean
  task_index?:       number
  metro?:            string
  phrase?:           string
  checked?:          number
  callable?:         number
  new_leads?:        number
  enriched?:         number
  dup_skipped?:      number
  no_phone?:         number
  searches_remaining?: number
  error?:            string
  note?:             string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 2)   return 'Just now'
  if (diffMin < 60)  return `${diffMin}m ago`
  if (diffMin < 120) return '1h ago'
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24)   return `${diffHr}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtNext(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return `Today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`
  }
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GoogleMapsSearchPanel() {
  const [status, setStatus]     = useState<SweepStatus | null>(null)
  const [loading, setLoading]   = useState(true)
  const [toggling, setToggling] = useState(false)
  const [testing, setTesting]   = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/import/sweep/status')
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json() as SweepStatus
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on mount + refresh every 30s when enabled
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (!status?.enabled) return
    const t = setInterval(fetchStatus, 30_000)
    return () => clearInterval(t)
  }, [status?.enabled, fetchStatus])

  const handleToggle = async (enable: boolean) => {
    setToggling(true)
    try {
      const res = await fetch('/api/import/sweep/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      })
      if (!res.ok) throw new Error('Toggle failed')
      setStatus(s => s ? { ...s, enabled: enable } : s)
    } catch {
      setError('Failed to update automation setting. Please try again.')
    } finally {
      setToggling(false)
    }
  }

  const handleRunTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/import/sweep/run-test', { method: 'POST' })
      const data = await res.json() as TestResult
      setTestResult(data)
      // Refresh status after test (quota counter changed)
      await fetchStatus()
    } catch (err) {
      setTestResult({ ok: false, quota_exceeded: false, error: String(err) })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Could not load status</p>
          <p className="text-xs mt-0.5">{error}</p>
          <button onClick={fetchStatus} className="text-xs underline mt-1">Retry</button>
        </div>
      </div>
    )
  }

  const s = status!
  const quotaPct      = s.daily_search_limit > 0 ? Math.round((s.searches_used_today / s.daily_search_limit) * 100) : 0
  const goalPct       = s.daily_goal > 0 ? Math.round((s.new_leads_today / s.daily_goal) * 100) : 0
  const cyclePct      = s.tasks_total > 0 ? Math.round((s.task_index / s.tasks_total) * 100) : 0
  const noQuota       = s.searches_remaining <= 0
  const noKey         = !s.api_key_configured
  const testDisabled  = testing || noKey || (noQuota && !s.enabled)

  return (
    <div className="space-y-3">
      {/* ── Main card ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">

        {/* Header + toggle */}
        <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-900">🗺 Google Daily Leads</p>
            <p className="text-xs text-gray-400 mt-0.5">Runs at 12:00 UTC (7 AM CDT) · Finds up to 90 new callable Texas businesses per day</p>
          </div>

          {/* ON / OFF toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium ${s.enabled ? 'text-green-700' : 'text-gray-400'}`}>
              {s.enabled ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={() => handleToggle(!s.enabled)}
              disabled={toggling || noKey}
              title={noKey ? 'GOOGLE_MAPS_API_KEY is not configured' : undefined}
              className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${
                s.enabled ? 'bg-green-500' : 'bg-gray-300'
              } ${(toggling || noKey) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                s.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        </div>

        {/* Warnings */}
        {noKey && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
            ⚠ <strong>GOOGLE_MAPS_API_KEY</strong> is not set in Netlify environment variables. Add it to enable automation.
          </div>
        )}
        {noQuota && !noKey && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
            📊 Daily Google quota reached — resumes tomorrow at 12:00 UTC.
          </div>
        )}

        {/* Today's stats */}
        <div className="px-4 py-3 space-y-3">

          {/* New leads goal bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span className="font-medium">New callable leads today</span>
              <span className="font-semibold text-gray-900">{s.new_leads_today} / {s.daily_goal}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, goalPct)}%` }}
              />
            </div>
          </div>

          {/* Searches quota bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Searches used today</span>
              <span>{s.searches_used_today} / {s.daily_search_limit}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${quotaPct >= 90 ? 'bg-amber-400' : 'bg-indigo-400'}`}
                style={{ width: `${Math.min(100, quotaPct)}%` }}
              />
            </div>
          </div>

          {/* Position + cycle */}
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
            <div>
              <p className="text-gray-400">Current position</p>
              <p className="font-medium text-gray-800">Task {s.task_index + 1} of {s.tasks_total} <span className="text-gray-400">({cyclePct}%)</span></p>
            </div>
            <div>
              <p className="text-gray-400">Duplicates skipped today</p>
              <p className="font-medium text-gray-800">{s.dup_skipped_today}</p>
            </div>
            <div>
              <p className="text-gray-400">Last run</p>
              <p className="font-medium text-gray-800">{fmtDate(s.last_run_at)}</p>
            </div>
            <div>
              <p className="text-gray-400">Next scheduled run</p>
              <p className="font-medium text-gray-800">{fmtNext(s.next_run_at)}</p>
            </div>
            {s.last_complete_cycle_at && (
              <div className="col-span-2">
                <p className="text-gray-400">Last complete Texas cycle</p>
                <p className="font-medium text-gray-800">{fmtDate(s.last_complete_cycle_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Run Test button */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={handleRunTest}
            disabled={testDisabled}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              testDisabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {testing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running test…</> : '▶ Run Test'}
          </button>
          {noKey && <p className="text-xs text-gray-400 mt-1">Set GOOGLE_MAPS_API_KEY in Netlify env vars first.</p>}
          {noQuota && !noKey && <p className="text-xs text-gray-400 mt-1">No quota remaining today — test resumes tomorrow.</p>}
        </div>
      </div>

      {/* ── Test result ───────────────────────────────────────────────────────── */}
      {testResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          testResult.quota_exceeded     ? 'bg-blue-50 border-blue-200' :
          !testResult.ok && testResult.error ? 'bg-red-50 border-red-200' :
                                               'bg-green-50 border-green-200'
        }`}>
          {testResult.quota_exceeded ? (
            <p className="text-blue-700 font-medium">📊 Daily quota reached — resumes tomorrow at 12:00 UTC</p>
          ) : testResult.error ? (
            <div>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-red-700 font-medium">Test failed</p>
              </div>
              <p className="text-red-600 text-xs mt-1">{testResult.error}</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <p className="text-green-800 font-semibold">
                  Test passed — {testResult.metro} / {testResult.phrase}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-gray-800">{testResult.checked ?? 0}</p>
                  <p className="text-gray-500">Checked</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-green-700">{testResult.callable ?? 0}</p>
                  <p className="text-gray-500">With Phone</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-indigo-700">{testResult.new_leads ?? 0}</p>
                  <p className="text-gray-500">Would Add</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-purple-700">{testResult.enriched ?? 0}</p>
                  <p className="text-gray-500">Would Enrich</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-gray-600">{testResult.dup_skipped ?? 0}</p>
                  <p className="text-gray-500">Dup Skipped</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-amber-600">{testResult.no_phone ?? 0}</p>
                  <p className="text-gray-500">No Phone</p>
                </div>
              </div>
              <p className="text-xs text-green-700 mt-2 italic">{testResult.note}</p>
              {(testResult.searches_remaining ?? 0) > 0 && (
                <p className="text-xs text-gray-500 mt-1">{testResult.searches_remaining} searches remaining today</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
