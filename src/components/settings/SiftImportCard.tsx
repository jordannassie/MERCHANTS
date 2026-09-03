'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, CheckCircle, AlertCircle, Loader2, ExternalLink,
  Download, Key, ArrowRight,
} from 'lucide-react'
import type { CompactSiftRow, MissingPair } from '@/app/api/import/sift-upload/route'

const SIFT_KEY_URL = 'https://data-secure.comptroller.texas.gov/main/view'

// ── Auto-import types (unchanged) ────────────────────────────────────────────

interface LastImport {
  filename:       string
  status:         string
  records_parsed: number
  leads_matched:  number
  phones_added:   number
  imported_at:    string
  error_message:  string | null
}

// ── Multi-phase upload types ──────────────────────────────────────────────────

type UploadPhase = 'idle' | 'parsing' | 'backfilling' | 'matching' | 'done' | 'error'

interface PhoneSummary {
  totalRows:            number
  validOutletPhones:    number
  validTaxpayerPhones:  number
  rowsWithAnyPhone:     number
  rowsWithNoPhone:      number
  usedOutletPhone:      number
  usedTaxpayerFallback: number
}

interface ParseData {
  parsedRows:     CompactSiftRow[]
  filename:       string
  phoneSummary:   PhoneSummary
  initialMatches: number
  alreadySaved:   number
  missing:        MissingPair[]
}

interface BackfillProgress {
  processed:    number
  total:        number
  created:      number
  notFound:     number
  socrataErrors: number
}

interface MatchResult {
  matched:          number
  phonesAdded:      number
  alreadySaved:     number
  taxpayerNotFound: number
  outletNotFound:   number
  errors:           number
}

interface Diagnostics {
  database: { total: number; withPhone: number; withPermitPhone: number }
  regions:  Record<string, number>
}

// ── How many missing pairs to send per backfill call
// 300 pairs → ≤3 Socrata requests of 100 each → ≤~9 s on server
const BACKFILL_CHUNK = 300

// ─────────────────────────────────────────────────────────────────────────────

export function SiftImportCard() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Auto-import state (unchanged) ──────────────────────────────────────────
  const [siftKeyConfigured, setSiftKeyConfigured] = useState<boolean | null>(null)
  const [stpAccessible,     setStpAccessible]     = useState<boolean | null>(null)
  const [availableFile,     setAvailableFile]      = useState<string | null>(null)
  const [lastImport,        setLastImport]         = useState<LastImport | null>(null)
  const [autoLoading,       setAutoLoading]        = useState(false)
  const [autoResult,        setAutoResult]         = useState<{
    summary?: { rowsParsed?: number; leadsMatched?: number; phonesAdded?: number }
    filename?: string; cached?: boolean; error?: string; errorCode?: string
  } | null>(null)

  // ── Multi-phase upload state ───────────────────────────────────────────────
  const [uploadPhase,       setUploadPhase]       = useState<UploadPhase>('idle')
  const [parseData,         setParseData]         = useState<ParseData | null>(null)
  const [backfillProgress,  setBackfillProgress]  = useState<BackfillProgress | null>(null)
  const [matchResult,       setMatchResult]       = useState<MatchResult | null>(null)
  const [diagnostics,       setDiagnostics]       = useState<Diagnostics | null>(null)
  const [uploadError,       setUploadError]       = useState<string | null>(null)
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  // ── Load initial SIFT status ───────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/import/sift-auto')
      .then(async r => { try { return await r.json() } catch { return {} } })
      .then((d: Record<string, unknown>) => {
        setSiftKeyConfigured((d.siftKeyConfigured as boolean | undefined) ?? false)
        setStpAccessible((d.stpAccessible     as boolean | undefined) ?? false)
        setAvailableFile((d.availableFile     as string  | undefined) ?? null)
        setLastImport((d.lastImport           as LastImport | undefined) ?? null)
      })
      .catch(() => setSiftKeyConfigured(false))
  }, [])

  // ── Auto-import handler (unchanged) ───────────────────────────────────────
  async function handleAutoImport(force = false) {
    if (autoLoading) return
    setAutoLoading(true)
    setAutoResult(null)
    try {
      const res  = await fetch('/api/import/sift-auto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const json = await res.json() as Record<string, unknown>
      if (!res.ok) {
        setAutoResult({ error: String(json.error ?? 'Import failed'), errorCode: json.errorCode as string | undefined })
      } else if (json.cached) {
        setAutoResult({ cached: true, filename: json.filename as string | undefined })
      } else {
        const summary = json.summary as { rowsParsed?: number; leadsMatched?: number; phonesAdded?: number } | undefined
        setAutoResult({ summary, filename: json.filename as string | undefined })
        if (json.filename) {
          setLastImport({
            filename:       json.filename as string,
            status:         'completed',
            records_parsed: summary?.rowsParsed  ?? 0,
            leads_matched:  summary?.leadsMatched ?? 0,
            phones_added:   summary?.phonesAdded  ?? 0,
            imported_at:    new Date().toISOString(),
            error_message:  null,
          })
        }
      }
    } catch (e) {
      setAutoResult({ error: String(e) })
    } finally {
      setAutoLoading(false)
    }
  }

  // ── Reset upload state ─────────────────────────────────────────────────────
  function resetUpload() {
    setUploadPhase('idle')
    setParseData(null)
    setBackfillProgress(null)
    setMatchResult(null)
    setDiagnostics(null)
    setUploadError(null)
    cancelRef.current = { cancelled: false }
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Main upload workflow ───────────────────────────────────────────────────
  const runFullWorkflow = useCallback(async (file: File) => {
    cancelRef.current = { cancelled: false }

    // ── Phase 1: Parse ────────────────────────────────────────────────────────
    setUploadPhase('parsing')
    setUploadError(null)

    let pd: ParseData
    try {
      const form = new FormData()
      form.append('file', file)

      const res  = await fetch('/api/import/sift-upload', { method: 'POST', body: form })
      const json = await res.json() as Record<string, unknown>

      if (!res.ok) throw new Error(String(json.error ?? `Parse failed (HTTP ${res.status})`))

      pd = {
        parsedRows:     (json.parsedRows     as CompactSiftRow[]) ?? [],
        filename:       (json.filename       as string)           ?? file.name,
        phoneSummary:   (json.phoneSummary   as PhoneSummary)     ?? {} as PhoneSummary,
        initialMatches: (json.initialMatches as number)           ?? 0,
        alreadySaved:   (json.alreadySaved   as number)           ?? 0,
        missing:        (json.missing        as MissingPair[])    ?? [],
      }
      setParseData(pd)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e))
      setUploadPhase('error')
      return
    }

    if (cancelRef.current.cancelled) return

    // ── Phase 2: Backfill missing canonical leads (auto-loop) ────────────────
    if (pd.missing.length > 0) {
      setUploadPhase('backfilling')

      let processed    = 0
      let totalCreated = 0
      let totalNotFound = 0
      let totalSocrataErrors = 0
      setBackfillProgress({ processed: 0, total: pd.missing.length, created: 0, notFound: 0, socrataErrors: 0 })

      try {
        while (processed < pd.missing.length) {
          if (cancelRef.current.cancelled) return

          const batch = pd.missing.slice(processed, processed + BACKFILL_CHUNK)
          const res   = await fetch('/api/import/sift-upload', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'backfill', missing: batch }),
          })
          const json = await res.json() as Record<string, unknown>
          if (!res.ok) throw new Error(String(json.error ?? `Backfill failed (HTTP ${res.status})`))

          totalCreated       += (json.created       as number) ?? 0
          totalNotFound      += (json.notFound       as number) ?? 0
          totalSocrataErrors += (json.socrataErrors  as number) ?? 0
          processed          += batch.length   // advance by what we sent

          setBackfillProgress({
            processed,
            total:        pd.missing.length,
            created:      totalCreated,
            notFound:     totalNotFound,
            socrataErrors: totalSocrataErrors,
          })
        }
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : String(e))
        setUploadPhase('error')
        return
      }
    }

    if (cancelRef.current.cancelled) return

    // ── Phase 3: Match all rows → save permit_phone ───────────────────────────
    setUploadPhase('matching')

    try {
      const res  = await fetch('/api/import/sift-upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'match', rows: pd.parsedRows, filename: pd.filename }),
      })
      const json = await res.json() as Record<string, unknown>
      if (!res.ok) throw new Error(String(json.error ?? `Match failed (HTTP ${res.status})`))

      setMatchResult({
        matched:          (json.matched          as number) ?? 0,
        phonesAdded:      (json.phonesAdded      as number) ?? 0,
        alreadySaved:     (json.alreadySaved     as number) ?? 0,
        taxpayerNotFound: (json.taxpayerNotFound as number) ?? 0,
        outletNotFound:   (json.outletNotFound   as number) ?? 0,
        errors:           (json.errors           as number) ?? 0,
      })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e))
      setUploadPhase('error')
      return
    }

    // ── Pull final diagnostic counts ──────────────────────────────────────────
    try {
      const dr = await fetch('/api/admin/diagnostics')
      if (dr.ok) setDiagnostics(await dr.json() as Diagnostics)
    } catch { /* non-critical */ }

    setUploadPhase('done')
    router.refresh()
  }, [router])

  // ── File drop / select ─────────────────────────────────────────────────────
  function handleFile(f: File) {
    resetUpload()
    runFullWorkflow(f)
  }

  // ─────────────────────────────────────────────────────────────────────────
  const isRunning = uploadPhase === 'parsing' || uploadPhase === 'backfilling' || uploadPhase === 'matching'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <Download size={14} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-gray-900">Texas Permit Phone Import (SIFT)</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a SIFT weekly permit-phone file. The app automatically resolves any missing
            canonical permit records from the Texas dataset, then attaches phones — no separate
            statewide import needed.
          </p>
        </div>
      </div>

      {/* ── SIFT key missing banner ─────────────────────────────────────────── */}
      {siftKeyConfigured === false && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 space-y-2 text-xs">
          <p className="font-semibold text-amber-800 flex items-center gap-1.5">
            <Key size={12} /> Automatic import not configured
          </p>
          <p className="text-amber-700">
            Add <code className="bg-amber-100 px-1 rounded font-mono">CPA_SIFT_API_KEY</code> to
            your Netlify environment variables to enable one-click and daily scheduled imports.
          </p>
          <ol className="list-decimal list-inside text-amber-700 space-y-1 ml-0.5">
            <li>
              <a href={SIFT_KEY_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline font-medium">
                Get or manage your Texas CPA API key <ExternalLink size={10} className="shrink-0" />
              </a>{' '}— select <span className="font-medium">Sales Tax Permit (STP)</span> when requesting access
            </li>
            <li>Add <code className="bg-amber-100 px-1 rounded font-mono">CPA_SIFT_API_KEY</code> to Netlify env vars (never <code className="bg-amber-100 px-1 rounded font-mono">NEXT_PUBLIC_</code>)</li>
            <li>Redeploy the site</li>
          </ol>
          <p className="text-amber-600">Manual file upload (below) works without a SIFT API key.</p>
        </div>
      )}

      {/* ── SIFT key set but no STP access ─────────────────────────────────── */}
      {siftKeyConfigured === true && stpAccessible === false && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 space-y-2 text-xs">
          <p className="font-semibold text-amber-800 flex items-center gap-1.5">
            <Key size={12} /> CPA_SIFT_API_KEY set, but STP file access not yet granted
          </p>
          <p className="text-amber-700">
            Your key connects to the SIFT API but only shows geographic (GISSS) files.
            The weekly sales-tax-permit phone file requires a key registered for the{' '}
            <span className="font-medium">Sales Tax Permit (STP)</span> section.
          </p>
          <p className="text-amber-600">Manual file upload (below) works in the meantime.</p>
        </div>
      )}

      {/* ── Auto-import — only when STP accessible ─────────────────────────── */}
      {siftKeyConfigured === true && stpAccessible === true && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700">Automatic Import</p>
              {lastImport ? (
                <p className="text-xs text-gray-400 truncate">
                  Last: <span className="font-mono">{lastImport.filename}</span>
                  {' '}· {lastImport.phones_added} phone{lastImport.phones_added !== 1 ? 's' : ''} added
                  {' '}· {new Date(lastImport.imported_at).toLocaleDateString()}
                </p>
              ) : availableFile ? (
                <p className="text-xs text-gray-400">Available: <span className="font-mono">{availableFile}</span> — never imported</p>
              ) : (
                <p className="text-xs text-gray-400">No permit-phone file imported yet</p>
              )}
            </div>
            <button
              onClick={() => handleAutoImport(false)}
              disabled={autoLoading}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {autoLoading
                ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                : <><Download size={14} /> Import Latest Texas Permit Phones</>
              }
            </button>
          </div>

          {autoResult?.error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{autoResult.error}</span>
            </div>
          )}
          {autoResult?.cached && (
            <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <CheckCircle size={12} />
              <span>
                <span className="font-mono">{autoResult.filename}</span> already imported.{' '}
                <button onClick={() => handleAutoImport(true)} className="underline font-medium" disabled={autoLoading}>
                  Re-import anyway
                </button>
              </span>
            </div>
          )}
          {autoResult?.summary && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800 space-y-0.5">
              <p className="font-semibold flex items-center gap-1.5"><CheckCircle size={12} /> Auto-import complete</p>
              <div className="grid grid-cols-3 gap-2">
                <div>Rows: <strong>{(autoResult.summary.rowsParsed ?? 0).toLocaleString()}</strong></div>
                <div>Matched: <strong>{(autoResult.summary.leadsMatched ?? 0).toLocaleString()}</strong></div>
                <div>Phones added: <strong>{(autoResult.summary.phonesAdded ?? 0).toLocaleString()}</strong></div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-100" />

      {/* ── Manual upload — new multi-phase flow ────────────────────────────── */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">Upload SIFT File</p>
        <p className="text-xs text-gray-400 mb-3">
          Upload <code className="bg-gray-100 px-1 rounded">stpMM-DDph.zip</code> or the extracted CSV.
          The app resolves any missing permit records automatically — no separate import step needed.
        </p>

        {/* Drop zone — show when idle or done */}
        {(uploadPhase === 'idle' || uploadPhase === 'done') && (
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              isRunning ? 'opacity-40 pointer-events-none' : 'hover:border-blue-300 border-gray-200'
            }`}
            onClick={() => !isRunning && inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && !isRunning) handleFile(f) }}
          >
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Upload size={24} />
              <span className="text-sm font-medium text-gray-600">
                {uploadPhase === 'done' ? 'Upload another SIFT file' : 'Drop the permit phone file here'}
              </span>
              <span className="text-xs">ZIP (stpMM-DDph.zip) or extracted CSV/TSV</span>
            </div>
            <input
              ref={inputRef} type="file" className="hidden"
              accept=".zip,.txt,.csv,.tsv,.dat"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
        )}

        {/* ── PROGRESS DISPLAY ─────────────────────────────────────────────── */}
        {(isRunning || uploadPhase === 'done' || uploadPhase === 'error') && parseData && (
          <div className="space-y-3 mt-2">

            {/* File name + phone summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                {isRunning && <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />}
                {uploadPhase === 'done' && <CheckCircle size={14} className="text-green-600 shrink-0" />}
                {uploadPhase === 'error' && <AlertCircle size={14} className="text-red-500 shrink-0" />}
                <span className="font-mono truncate">{parseData.filename}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 text-gray-600">
                <div>Rows parsed: <strong>{parseData.phoneSummary.totalRows.toLocaleString()}</strong></div>
                <div>Rows with valid phone: <strong className="text-green-700">{parseData.phoneSummary.rowsWithAnyPhone.toLocaleString()}</strong></div>
                <div>Outlet phone: <strong>{parseData.phoneSummary.usedOutletPhone.toLocaleString()}</strong></div>
                <div>Taxpayer fallback: <strong>{parseData.phoneSummary.usedTaxpayerFallback.toLocaleString()}</strong></div>
                {parseData.phoneSummary.rowsWithNoPhone > 0 && (
                  <div className="text-amber-600">No valid phone: <strong>{parseData.phoneSummary.rowsWithNoPhone.toLocaleString()}</strong></div>
                )}
              </div>
            </div>

            {/* Phase 1 result */}
            <PhaseRow
              icon={<CheckCircle size={13} className="text-green-500 shrink-0 mt-0.5" />}
              label="Matched existing leads"
              value={parseData.initialMatches}
              sub={parseData.alreadySaved > 0 ? `${parseData.alreadySaved.toLocaleString()} already had this phone` : undefined}
              done
            />

            {/* Phase 2 — backfill */}
            {parseData.missing.length === 0 ? (
              <PhaseRow
                icon={<CheckCircle size={13} className="text-green-500 shrink-0 mt-0.5" />}
                label="Missing permit records"
                value={0}
                sub="All taxpayer records already in DB"
                done
              />
            ) : (
              <div className="text-xs border border-gray-200 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  {backfillProgress && backfillProgress.processed >= backfillProgress.total
                    ? <CheckCircle size={13} className="text-green-500 shrink-0" />
                    : uploadPhase === 'backfilling'
                      ? <Loader2 size={13} className="animate-spin text-blue-500 shrink-0" />
                      : uploadPhase === 'done' || uploadPhase === 'matching'
                        ? <CheckCircle size={13} className="text-green-500 shrink-0" />
                        : <div className="w-3 h-3 rounded-full border border-gray-300 shrink-0" />
                  }
                  <span className="font-medium text-gray-700">
                    Resolving {parseData.missing.length.toLocaleString()} missing permit records
                  </span>
                </div>
                {backfillProgress && (
                  <div className="pl-5 space-y-1">
                    {/* Progress bar */}
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (backfillProgress.processed / backfillProgress.total) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>{backfillProgress.processed.toLocaleString()} / {backfillProgress.total.toLocaleString()}</span>
                      <span className="text-green-700 font-medium">{backfillProgress.created.toLocaleString()} created</span>
                    </div>
                    {backfillProgress.notFound > 0 && (
                      <div className="text-amber-600">Not found in Texas dataset: {backfillProgress.notFound.toLocaleString()}</div>
                    )}
                    {backfillProgress.socrataErrors > 0 && (
                      <div className="text-red-500">Source fetch errors: {backfillProgress.socrataErrors.toLocaleString()}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Phase 3 — matching */}
            <div className="text-xs border border-gray-200 rounded-lg px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                {matchResult
                  ? <CheckCircle size={13} className="text-green-500 shrink-0" />
                  : uploadPhase === 'matching'
                    ? <Loader2 size={13} className="animate-spin text-blue-500 shrink-0" />
                    : <div className="w-3 h-3 rounded-full border border-gray-300 shrink-0" />
                }
                <span className="font-medium text-gray-700">
                  {matchResult ? 'Phone matching complete' : 'Matching phones to leads…'}
                </span>
              </div>
              {matchResult && (
                <div className="pl-5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                  <div>Total matched: <strong>{matchResult.matched.toLocaleString()}</strong></div>
                  <div className="text-green-700">Phones added: <strong>{matchResult.phonesAdded.toLocaleString()}</strong></div>
                  {matchResult.alreadySaved > 0 && <div>Already saved: <span>{matchResult.alreadySaved.toLocaleString()}</span></div>}
                  {matchResult.taxpayerNotFound > 0 && <div className="text-amber-600">Taxpayer not found: <span>{matchResult.taxpayerNotFound.toLocaleString()}</span></div>}
                  {matchResult.outletNotFound > 0 && <div className="text-amber-600">Outlet mismatch: <span>{matchResult.outletNotFound.toLocaleString()}</span></div>}
                  {matchResult.errors > 0 && <div className="text-red-500">Errors: <span>{matchResult.errors.toLocaleString()}</span></div>}
                </div>
              )}
            </div>

            {/* ── Final summary ──────────────────────────────────────────────── */}
            {uploadPhase === 'done' && matchResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-3">
                <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                  <CheckCircle size={15} />
                  SIFT processing complete
                </p>

                {/* SIFT totals */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-green-800">
                  <div>Rows with valid phone: <strong>{parseData.phoneSummary.rowsWithAnyPhone.toLocaleString()}</strong></div>
                  <div>Leads matched: <strong>{matchResult.matched.toLocaleString()}</strong></div>
                  <div>Phones added/updated: <strong>{matchResult.phonesAdded.toLocaleString()}</strong></div>
                  {(backfillProgress?.created ?? 0) > 0 && (
                    <div>New leads created: <strong>{(backfillProgress?.created ?? 0).toLocaleString()}</strong></div>
                  )}
                  {(matchResult.taxpayerNotFound + matchResult.outletNotFound) > 0 && (
                    <div className="text-amber-700">Unresolved: <strong>{(matchResult.taxpayerNotFound + matchResult.outletNotFound).toLocaleString()}</strong></div>
                  )}
                </div>

                {/* DB totals */}
                {diagnostics && (
                  <>
                    <div className="border-t border-green-200 pt-2 space-y-1">
                      <p className="text-xs font-semibold text-green-700">Texas database totals</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-green-800">
                        <div>Total TX businesses: <strong>{diagnostics.database.total.toLocaleString()}</strong></div>
                        <div>Callable: <strong>{diagnostics.database.withPhone.toLocaleString()}</strong></div>
                        <div>Permit phones: <strong>{diagnostics.database.withPermitPhone.toLocaleString()}</strong></div>
                      </div>
                    </div>

                    {/* Callable by region */}
                    {diagnostics.regions && Object.keys(diagnostics.regions).length > 0 && (
                      <div className="border-t border-green-200 pt-2">
                        <p className="text-xs font-semibold text-green-700 mb-1">Callable by region</p>
                        <div className="grid grid-cols-3 gap-1">
                          {['DFW', 'Houston', 'Austin', 'San Antonio', 'El Paso', 'Other Texas', 'All Texas'].map(r => {
                            const count = diagnostics.regions?.[r] ?? 0
                            return (
                              <div key={r} className="text-center bg-white rounded-lg py-1.5 border border-green-100">
                                <p className="text-xs font-bold text-green-800">{count.toLocaleString()}</p>
                                <p className="text-[10px] text-green-600 leading-tight">{r}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <button
                  onClick={resetUpload}
                  className="mt-1 text-xs text-green-700 underline"
                >
                  Upload another file
                </button>
              </div>
            )}

            {/* Error */}
            {uploadPhase === 'error' && uploadError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-red-700 font-medium">
                  <AlertCircle size={14} /> Upload failed
                </div>
                <p className="text-red-600 text-xs">{uploadError}</p>
                <button onClick={resetUpload} className="text-xs text-red-600 underline">Try again</button>
              </div>
            )}

            {/* Cancel button while running */}
            {isRunning && (
              <button
                onClick={() => { cancelRef.current.cancelled = true; setUploadPhase('error'); setUploadError('Cancelled by user.') }}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Parsing spinner (before parseData arrives) */}
        {uploadPhase === 'parsing' && !parseData && (
          <div className="mt-4 flex flex-col items-center gap-2 text-gray-500 py-6">
            <Loader2 size={24} className="animate-spin text-blue-500" />
            <span className="text-sm">Parsing permit file…</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small helper ─────────────────────────────────────────────────────────────

function PhaseRow({ icon, label, value, sub, done }: {
  icon:   React.ReactNode
  label:  string
  value:  number
  sub?:   string
  done?:  boolean
}) {
  return (
    <div className="flex items-start gap-2 text-xs border border-gray-200 rounded-lg px-3 py-2.5">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between">
          <span className={`font-medium ${done ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
          <span className={`font-mono font-semibold ${done ? 'text-gray-900' : 'text-gray-400'}`}>
            {value.toLocaleString()}
          </span>
        </div>
        {sub && <p className="text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {done && <ArrowRight size={12} className="text-gray-300 shrink-0 mt-0.5" />}
    </div>
  )
}
