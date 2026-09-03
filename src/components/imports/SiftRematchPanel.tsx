'use client'

/**
 * SiftRematchPanel
 *
 * Shows the last SIFT import stats (phone-source breakdown, match outcomes)
 * and provides a one-click "Force Re-match" that re-downloads and re-processes
 * the latest stpMM-DDph.zip using the fixed phone-fallback parser.
 *
 * Requires CPA_SIFT_API_KEY to be configured server-side.
 * If the key is missing, shows instructions to re-upload manually.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, CheckCircle, AlertCircle, Phone } from 'lucide-react'

interface PhoneSummary {
  totalRows?:            number
  validOutletPhones?:    number
  validTaxpayerPhones?:  number
  rowsWithAnyPhone?:     number
  rowsWithNoPhone?:      number
  usedOutletPhone?:      number
  usedTaxpayerFallback?: number
}

interface MatchBreakdown {
  rowsWithValidPhone?:  number
  leadsMatched?:        number
  phonesAdded?:         number
  alreadySaved?:        number
  taxpayerNotFound?:    number
  outletMismatch?:      number
  nonOutletRecord?:     number
  errors?:              number
}

interface SiftStatus {
  siftKeyConfigured: boolean
  stpAccessible:     boolean
  availableFile:     string | null
  lastImport: {
    filename:       string
    status:         string
    records_parsed: number
    leads_matched:  number
    phones_added:   number
    imported_at:    string
    error_message?: string | null  // may contain JSON extended stats
  } | null
}

type Phase = 'idle' | 'running' | 'done' | 'error'

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString()
}

// Safely parse extended stats from sift_import_log.error_message JSON
function parseExtendedStats(errorMsg: string | null | undefined): {
  phoneSummary?: PhoneSummary
  matchBreakdown?: MatchBreakdown
} {
  if (!errorMsg) return {}
  try {
    const parsed = JSON.parse(errorMsg)
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* not JSON */ }
  return {}
}

export function SiftRematchPanel() {
  const [status, setStatus]     = useState<SiftStatus | null>(null)
  const [phase,  setPhase]      = useState<Phase>('idle')
  const [result, setResult]     = useState<{ phoneSummary?: PhoneSummary; matchBreakdown?: MatchBreakdown; filename?: string } | null>(null)
  const [error,  setError]      = useState<string | null>(null)

  // Load current SIFT status on mount
  const loadStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/import/sift-auto')
      const json = await res.json() as SiftStatus
      setStatus(json)
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function forceRematch() {
    setPhase('running')
    setError(null)
    setResult(null)
    try {
      const res  = await fetch('/api/import/sift-auto', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ force: true }),
      })
      const json = await res.json() as {
        error?:         string
        cached?:        boolean
        filename?:      string
        phoneSummary?:  PhoneSummary
        matchBreakdown?: MatchBreakdown
        summary?: { rowsParsed?: number; leadsMatched?: number; phonesAdded?: number }
      }

      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`)
        setPhase('error')
        return
      }

      setResult({
        filename:      json.filename,
        phoneSummary:  json.phoneSummary,
        matchBreakdown: json.matchBreakdown,
      })
      setPhase('done')
      await loadStatus()   // refresh last-import stats
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPhase('error')
    }
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
        <Loader2 size={14} className="animate-spin" /> Checking SIFT status…
      </div>
    )
  }

  const { siftKeyConfigured, stpAccessible, availableFile, lastImport } = status
  const extended = parseExtendedStats(lastImport?.error_message)

  return (
    <div className="space-y-4">
      {/* ── Current SIFT last-import snapshot ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-gray-700">
            {lastImport ? (
              <>Last match: <span className="font-mono text-gray-900">{lastImport.filename}</span></>
            ) : (
              'No SIFT import on record'
            )}
          </p>
          {lastImport && (
            <p className="text-xs text-gray-400">
              {new Date(lastImport.imported_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {' · '}{fmt(lastImport.leads_matched)} matched
              {' · '}{fmt(lastImport.phones_added)} phones added
            </p>
          )}
          {availableFile && (
            <p className="text-xs text-blue-600">
              Available on SIFT API: <span className="font-mono">{availableFile}</span>
            </p>
          )}
        </div>

        {siftKeyConfigured && stpAccessible ? (
          <button
            onClick={forceRematch}
            disabled={phase === 'running'}
            className="shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            {phase === 'running'
              ? <><Loader2 size={14} className="animate-spin" /> Re-matching…</>
              : <><RefreshCw size={14} /> Force Re-match SIFT</>
            }
          </button>
        ) : (
          <div className="shrink-0 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-xs">
            {!siftKeyConfigured
              ? 'CPA_SIFT_API_KEY not configured — re-upload the SIFT file manually below.'
              : 'CPA key found but STP access not granted — re-upload manually below.'
            }
          </div>
        )}
      </div>

      {/* ── Last-import extended stats (from stored JSON) ── */}
      {lastImport && (extended.phoneSummary || extended.matchBreakdown) && phase === 'idle' && (
        <ExtendedStats
          filename={lastImport.filename}
          ps={extended.phoneSummary}
          mb={extended.matchBreakdown}
        />
      )}

      {/* ── Running indicator ── */}
      {phase === 'running' && (
        <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
          <Loader2 size={14} className="animate-spin" />
          Downloading &amp; processing {availableFile ?? 'latest SIFT file'} with phone fallback (outlet → taxpayer)…
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Result ── */}
      {phase === 'done' && result && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
            <CheckCircle size={15} />
            Re-match complete — {result.filename}
          </div>
          <ExtendedStats filename="" ps={result.phoneSummary} mb={result.matchBreakdown} />
        </div>
      )}
    </div>
  )
}

// ── ExtendedStats sub-component ───────────────────────────────────────────────

function ExtendedStats({
  filename,
  ps,
  mb,
}: {
  filename: string
  ps?: PhoneSummary
  mb?: MatchBreakdown
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 text-xs">
      {/* Phone coverage */}
      {ps && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-600 flex items-center gap-1.5 mb-2">
            <Phone size={11} /> Phone coverage{filename ? ` — ${filename}` : ''}
          </p>
          <Row label="Total SIFT rows"        value={ps.totalRows}            />
          <Row label="Valid outlet phones (col 15)" value={ps.validOutletPhones}  />
          <Row label="Valid taxpayer phones (col 8)" value={ps.validTaxpayerPhones} />
          <Row label="Rows with any phone"    value={ps.rowsWithAnyPhone}     bold green />
          <Row label="No valid phone"         value={ps.rowsWithNoPhone}      />
          {(ps.usedTaxpayerFallback ?? 0) > 0 && (
            <>
              <Row label="Used outlet phone"      value={ps.usedOutletPhone}      />
              <Row label="Used taxpayer fallback" value={ps.usedTaxpayerFallback} />
            </>
          )}
        </div>
      )}

      {/* Match outcomes */}
      {mb && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-600 mb-2">Match outcomes</p>
          <Row label="Rows with valid phone"  value={mb.rowsWithValidPhone}   />
          <Row label="Leads matched"          value={mb.leadsMatched}          bold green />
          <Row label="Phones added / updated" value={mb.phonesAdded}           bold green />
          <Row label="Already saved (idempotent)" value={mb.alreadySaved}     />
          <Row label="Taxpayer not in DB"     value={mb.taxpayerNotFound}      warn />
          <Row label="Outlet mismatch"        value={mb.outletMismatch}        warn />
          <Row label="USE TAX / 00000 — no lead" value={mb.nonOutletRecord}   />
        </div>
      )}
    </div>
  )
}

function Row({
  label, value, bold, green, warn,
}: {
  label: string; value?: number | null; bold?: boolean; green?: boolean; warn?: boolean
}) {
  const n = value ?? 0
  if (n === 0 && !bold) return null   // hide zero rows unless they're key metrics
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono ${bold && green ? 'font-bold text-green-700' : bold ? 'font-semibold text-gray-800' : warn && n > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
        {n.toLocaleString()}
      </span>
    </div>
  )
}
