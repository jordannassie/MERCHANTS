'use client'

import { useState, useRef, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import type { Territory, ImportRun } from '@/lib/types'
import { fmtRelative } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface Props {
  territory: Territory | null
  lastRun:   ImportRun | null
}

// ── State types ───────────────────────────────────────────────────────────────

type Phase =
  | 'idle'
  | 'importing'      // running permit-import batches
  | 'sift-matching'  // running sift-auto after import
  | 'complete'       // everything done
  | 'error'

interface Progress {
  batchNum:        number
  totalFetched:    number
  totalInserted:   number
  totalUpdated:    number
  totalDuplicates: number
  totalSkipped:    number
}

interface SiftResult {
  skipped?:      boolean   // already imported, not re-run
  rowsParsed?:   number
  leadsMatched?: number
  phonesAdded?:  number
  error?:        string
  needsUpload?:  boolean   // key missing — user must re-upload
}

interface Diagnostics {
  database: {
    total:            number
    withPhone:        number
    withPermitPhone:  number
  }
  regions: Record<string, number>
  lastSift: {
    filename:       string
    records_parsed: number
    leads_matched:  number
    phones_added:   number
  } | null
}

// ─────────────────────────────────────────────────────────────────────────────

export function ImportButton({ territory, lastRun }: Props) {
  const router   = useRouter()
  const [open,   setOpen]   = useState(false)
  const [phase,  setPhase]  = useState<Phase>('idle')
  const [progress, setProgress] = useState<Progress>({
    batchNum: 0, totalFetched: 0, totalInserted: 0,
    totalUpdated: 0, totalDuplicates: 0, totalSkipped: 0,
  })
  const [sift,   setSift]   = useState<SiftResult | null>(null)
  const [diag,   setDiag]   = useState<Diagnostics | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  // Abort signal so the user can cancel mid-import
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  // ── Reset dialog to idle ──────────────────────────────────────────────────
  function resetDialog() {
    setPhase('idle')
    setProgress({ batchNum: 0, totalFetched: 0, totalInserted: 0, totalUpdated: 0, totalDuplicates: 0, totalSkipped: 0 })
    setSift(null)
    setDiag(null)
    setError(null)
    abortRef.current = { cancelled: false }
  }

  function handleOpen() {
    resetDialog()
    setOpen(true)
  }

  // ── Main import loop ──────────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    abortRef.current = { cancelled: false }
    setPhase('importing')
    setError(null)

    let importRunId: string | null = null
    let nextOffset: number | null  = 0
    let batchNum = 0

    // ── Step 1: permit import batches ────────────────────────────────────────
    try {
      while (nextOffset !== null) {
        if (abortRef.current.cancelled) {
          setError('Import cancelled.')
          setPhase('error')
          return
        }

        batchNum++

        const res  = await fetch('/api/import/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset:      nextOffset,
            importRunId: importRunId ?? undefined,
          }),
        })

        const text = await res.text()
        let json: Record<string, unknown>
        try { json = JSON.parse(text) } catch { throw new Error(`Server error (HTTP ${res.status})`) }
        if (!res.ok) throw new Error(String(json.error ?? 'Import failed'))

        importRunId = (json.importRunId as string) ?? importRunId
        nextOffset  = (json.nextOffset  as number | null) ?? null

        setProgress({
          batchNum,
          totalFetched:    (json.totalFetched    as number) ?? 0,
          totalInserted:   (json.totalInserted   as number) ?? 0,
          totalUpdated:    (json.totalUpdated    as number) ?? 0,
          totalDuplicates: (json.totalDuplicates as number) ?? 0,
          totalSkipped:    (json.totalSkipped    as number) ?? 0,
        })

        if ((json.status as string) === 'completed') {
          nextOffset = null   // safety: ensure loop exits
          break
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error during import')
      setPhase('error')
      return
    }

    // ── Step 2: SIFT re-match ────────────────────────────────────────────────
    setPhase('sift-matching')

    try {
      // Check if key + STP access is available
      const statusRes  = await fetch('/api/import/sift-auto')
      const statusJson = await statusRes.json() as {
        siftKeyConfigured: boolean
        stpAccessible:     boolean
        availableFile:     string | null
      }

      if (!statusJson.siftKeyConfigured || !statusJson.stpAccessible) {
        // No key or no STP access — user must re-upload manually
        setSift({ needsUpload: true })
      } else {
        // Trigger re-match with force=true so new leads get matched even if
        // the SIFT file was previously imported with fewer statewide leads.
        const matchRes  = await fetch('/api/import/sift-auto', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ force: true }),
        })
        const matchJson = await matchRes.json() as {
          cached?:  boolean
          summary?: { rowsParsed: number; leadsMatched: number; phonesAdded: number }
          error?:   string
        }

        if (!matchRes.ok || matchJson.error) {
          setSift({ error: matchJson.error ?? `SIFT error (HTTP ${matchRes.status})` })
        } else {
          setSift({
            skipped:      matchJson.cached,
            rowsParsed:   matchJson.summary?.rowsParsed,
            leadsMatched: matchJson.summary?.leadsMatched,
            phonesAdded:  matchJson.summary?.phonesAdded,
          })
        }
      }
    } catch (e) {
      setSift({ error: e instanceof Error ? e.message : 'SIFT match failed' })
    }

    // ── Step 3: Pull final diagnostic counts ─────────────────────────────────
    try {
      const diagRes  = await fetch('/api/admin/diagnostics')
      const diagJson = await diagRes.json() as Diagnostics
      setDiag(diagJson)
    } catch { /* non-critical — show without counts */ }

    setPhase('complete')
    router.refresh()
  }, [router])

  // ─────────────────────────────────────────────────────────────────────────
  //  Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function fmt(n: number | undefined | null): string {
    return (n ?? 0).toLocaleString()
  }

  const isRunning = phase === 'importing' || phase === 'sift-matching'

  // ─────────────────────────────────────────────────────────────────────────
  //  Dialog content by phase
  // ─────────────────────────────────────────────────────────────────────────

  function renderIdle() {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-700 space-y-2">
          <p><span className="text-gray-500">Territory:</span> <strong>{territory?.name ?? 'Texas Statewide'}</strong></p>
          <p><span className="text-gray-500">Date range:</span> <strong>Last {territory?.days_to_import ?? 14} days</strong></p>
          <p><span className="text-gray-500">Scope:</span> <strong>All Texas (statewide)</strong></p>
          {lastRun && (
            <p className="text-gray-400 text-xs">Last run: {fmtRelative(lastRun.started_at)}</p>
          )}
        </div>
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          This will automatically run all batches until complete — no need to click again.
          Keep this dialog open while importing.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={runImport}>Run Import</Button>
        </div>
      </div>
    )
  }

  function renderImporting() {
    const { batchNum, totalFetched, totalInserted, totalUpdated, totalDuplicates } = progress
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-blue-700">
          <Loader2 size={16} className="animate-spin flex-shrink-0" />
          <span className="text-sm font-medium">
            {phase === 'sift-matching' ? 'Matching SIFT phone file…' : `Importing — Batch ${batchNum}`}
          </span>
        </div>

        {phase === 'importing' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between text-blue-800">
              <span>Fetched</span>
              <strong>{fmt(totalFetched)}</strong>
            </div>
            <div className="flex justify-between text-blue-800">
              <span>Added</span>
              <strong>{fmt(totalInserted)}</strong>
            </div>
            <div className="flex justify-between text-blue-800">
              <span>Updated</span>
              <strong>{fmt(totalUpdated)}</strong>
            </div>
            <div className="flex justify-between text-blue-700 text-xs">
              <span>Duplicates skipped</span>
              <span>{fmt(totalDuplicates)}</span>
            </div>
          </div>
        )}

        {phase === 'sift-matching' && (
          <p className="text-sm text-gray-500">
            Re-matching latest SIFT phone file against all imported leads…
          </p>
        )}

        <p className="text-xs text-gray-400 text-center">Do not close this dialog — import is running automatically.</p>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => { abortRef.current.cancelled = true }}
        >
          Cancel
        </Button>
      </div>
    )
  }

  function renderComplete() {
    const { totalFetched, totalInserted, totalUpdated, totalDuplicates, totalSkipped } = progress
    return (
      <div className="space-y-4">
        {/* Import summary */}
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm">
          <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
            <CheckCircle size={16} />
            Statewide import complete
          </div>
          <div className="space-y-0.5 text-green-700">
            <div className="flex justify-between"><span>Fetched from API</span><strong>{fmt(totalFetched)}</strong></div>
            <div className="flex justify-between"><span>Added (new)</span><strong>{fmt(totalInserted)}</strong></div>
            <div className="flex justify-between"><span>Updated (existing)</span><strong>{fmt(totalUpdated)}</strong></div>
            <div className="flex justify-between text-xs text-green-600"><span>Duplicates skipped</span><span>{fmt(totalDuplicates)}</span></div>
            <div className="flex justify-between text-xs text-green-600"><span>Records skipped</span><span>{fmt(totalSkipped)}</span></div>
          </div>
        </div>

        {/* SIFT result */}
        {sift && (
          <div className={`rounded-lg border p-3 text-sm ${
            sift.needsUpload || sift.error
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {sift.needsUpload ? (
              <>
                <p className="font-semibold mb-1">📤 Re-upload required</p>
                <p>
                  CPA SIFT API key is not configured. To match phones, re-upload{' '}
                  <code className="bg-yellow-100 px-1 rounded">stp08-31ph.zip</code>{' '}
                  below on this page.
                </p>
              </>
            ) : sift.error ? (
              <>
                <p className="font-semibold mb-1">⚠ SIFT match error</p>
                <p className="text-xs">{sift.error}</p>
              </>
            ) : (
              <>
                <p className="font-semibold mb-1">✓ SIFT phone re-match complete</p>
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span>SIFT rows parsed</span><strong>{fmt(sift.rowsParsed)}</strong></div>
                  <div className="flex justify-between"><span>Leads matched</span><strong>{fmt(sift.leadsMatched)}</strong></div>
                  <div className="flex justify-between"><span>Phones added/updated</span><strong>{fmt(sift.phonesAdded)}</strong></div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Final diagnostic counts */}
        {diag && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm">
            <p className="font-semibold text-gray-700 mb-2">Final counts</p>
            <div className="space-y-0.5 text-gray-600 text-xs">
              <div className="flex justify-between"><span>Total Texas leads</span><strong className="text-gray-900">{fmt(diag.database.total)}</strong></div>
              <div className="flex justify-between"><span>Callable leads</span><strong className="text-gray-900">{fmt(diag.database.withPhone)}</strong></div>
              <div className="flex justify-between"><span>Permit phones</span><strong className="text-gray-900">{fmt(diag.database.withPermitPhone)}</strong></div>
            </div>
            <div className="border-t border-gray-200 mt-2 pt-2 space-y-0.5 text-gray-500 text-xs">
              {Object.entries(diag.regions).map(([region, count]) => (
                <div key={region} className="flex justify-between">
                  <span>{region} callable</span>
                  <span className="font-medium text-gray-700">{fmt(count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="primary" className="w-full" onClick={() => setOpen(false)}>Done</Button>
      </div>
    )
  }

  function renderError() {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <AlertCircle size={16} />
            Import failed
          </div>
          <p className="text-red-700">{error}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Close</Button>
          <Button variant="primary" className="flex-1" onClick={runImport}>Retry</Button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={handleOpen}
        className="flex items-center gap-2"
      >
        <RefreshCw size={14} />
        Import Texas Leads
      </Button>

      <Dialog
        open={open}
        onClose={() => { if (!isRunning) setOpen(false) }}
        title="Import Texas Leads"
        size="sm"
      >
        {phase === 'idle'                                     && renderIdle()}
        {(phase === 'importing' || phase === 'sift-matching') && renderImporting()}
        {phase === 'complete'                                 && renderComplete()}
        {phase === 'error'                                    && renderError()}
      </Dialog>
    </>
  )
}
