'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader2, ExternalLink, Download, Key } from 'lucide-react'

const SIFT_KEY_URL = 'https://data-secure.comptroller.texas.gov/main/view'

interface ImportSummary {
  rowsParsed?: number
  leadsMatched?: number
  phonesAdded?: number
  phonesSkipped?: number
  noPhone?: number
  errorCount?: number
  // Legacy manual-upload field names
  matched?: number
  updated?: number
  skipped?: number
}

interface LastImport {
  filename: string
  status: string
  records_parsed: number
  leads_matched: number
  phones_added: number
  imported_at: string
  error_message: string | null
}

export function SiftImportCard() {
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Auto-import state ──────────────────────────────────────────────────────
  const [siftKeyConfigured, setSiftKeyConfigured] = useState<boolean | null>(null)
  const [stpAccessible, setStpAccessible] = useState<boolean | null>(null)
  const [availableFile, setAvailableFile] = useState<string | null>(null)
  const [lastImport, setLastImport] = useState<LastImport | null>(null)
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoResult, setAutoResult] = useState<{ summary?: ImportSummary; filename?: string; cached?: boolean; error?: string; errorCode?: string } | null>(null)

  // ── Manual upload state ────────────────────────────────────────────────────
  const [manualLoading, setManualLoading] = useState(false)
  const [manualResult, setManualResult] = useState<{ summary?: ImportSummary; error?: string } | null>(null)

  // ── Load initial status ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/import/sift-auto')
      .then(r => r.json())
      .then(d => {
        setSiftKeyConfigured(d.siftKeyConfigured ?? false)
        setStpAccessible(d.stpAccessible ?? false)
        setAvailableFile(d.availableFile ?? null)
        setLastImport(d.lastImport ?? null)
      })
      .catch(() => setSiftKeyConfigured(false))
  }, [])

  // ── Auto-import handler ────────────────────────────────────────────────────
  async function handleAutoImport(force = false) {
    if (autoLoading) return
    setAutoLoading(true)
    setAutoResult(null)
    try {
      const res = await fetch('/api/import/sift-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAutoResult({ error: json.error ?? 'Import failed', errorCode: json.errorCode })
      } else if (json.cached) {
        setAutoResult({ cached: true, filename: json.filename })
      } else {
        setAutoResult({ summary: json.summary, filename: json.filename })
        setLastImport({
          filename: json.filename,
          status: 'completed',
          records_parsed: json.summary?.rowsParsed ?? 0,
          leads_matched: json.summary?.leadsMatched ?? 0,
          phones_added: json.summary?.phonesAdded ?? 0,
          imported_at: new Date().toISOString(),
          error_message: null,
        })
      }
    } catch (e) {
      setAutoResult({ error: String(e) })
    } finally {
      setAutoLoading(false)
    }
  }

  // ── Manual file upload handler ─────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file) return
    setManualLoading(true)
    setManualResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/import/sift-permits', { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok) {
        setManualResult({ summary: json.summary })
      } else {
        setManualResult({ error: json.error ?? 'Import failed' })
      }
    } catch (e) {
      setManualResult({ error: String(e) })
    } finally {
      setManualLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
          <Download size={14} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-medium text-gray-900">Texas Permit Phone Import (SIFT)</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Imports business telephone numbers from the Texas Comptroller&apos;s weekly
            new-permit file. Permit phones are stored separately from manually entered
            phones and are{' '}
            <span className="font-medium text-gray-700">
              never labeled as an owner&apos;s personal number
            </span>.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Telephone supplied with the Texas sales-tax permit.
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
                Get or manage your Texas CPA API key
                <ExternalLink size={10} className="shrink-0" />
              </a>
              {' '}— select <span className="font-medium">Sales Tax Permit (STP)</span> when requesting access
            </li>
            <li>Add <code className="bg-amber-100 px-1 rounded font-mono">CPA_SIFT_API_KEY</code> to Netlify env vars (never <code className="bg-amber-100 px-1 rounded font-mono">NEXT_PUBLIC_</code>)</li>
            <li>Redeploy the site</li>
          </ol>
          <p className="text-amber-600">Manual file upload (below) works without a SIFT API key.</p>
        </div>
      )}

      {/* ── SIFT key configured but no STP access ───────────────────────────── */}
      {siftKeyConfigured === true && stpAccessible === false && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 space-y-2 text-xs">
          <p className="font-semibold text-amber-800 flex items-center gap-1.5">
            <Key size={12} /> CPA_SIFT_API_KEY set, but STP file access not yet granted
          </p>
          <p className="text-amber-700">
            Your key connects to the SIFT API but only shows geographic (GISSS) files.
            The weekly sales-tax-permit phone file (<code className="bg-amber-100 px-1 rounded font-mono">stpMM-DDph.zip</code>) requires
            a key registered for the <span className="font-medium">Sales Tax Permit (STP)</span> section.
          </p>
          <ol className="list-decimal list-inside text-amber-700 space-y-1 ml-0.5">
            <li>Log in at{' '}
              <a href={SIFT_KEY_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline font-medium">
                data-secure.comptroller.texas.gov
                <ExternalLink size={10} className="shrink-0" />
              </a>
            </li>
            <li>Request access to the weekly <span className="font-medium">Sales Tax Permit (STP)</span> data section</li>
            <li>Once approved, update <code className="bg-amber-100 px-1 rounded font-mono">CPA_SIFT_API_KEY</code> in Netlify with the STP key and redeploy</li>
          </ol>
          <p className="text-amber-600">Manual file upload (below) works in the meantime.</p>
        </div>
      )}

      {/* ── Auto-import section — only show when STP is accessible ─────────── */}
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
                <p className="text-xs text-gray-400">
                  Available: <span className="font-mono">{availableFile}</span> — never imported
                </p>
              ) : (
                <p className="text-xs text-gray-400">No previous import recorded</p>
              )}
            </div>
            <button
              onClick={() => handleAutoImport(false)}
              disabled={autoLoading}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {autoLoading
                ? <><Loader2 size={14} className="animate-spin" /> Importing…</>
                : <><Download size={14} /> Import Latest Texas Permit Phones</>
              }
            </button>
          </div>

          {/* Auto-import result */}
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
                <span className="font-mono">{autoResult.filename}</span> was already imported.{' '}
                <button
                  onClick={() => handleAutoImport(true)}
                  className="underline font-medium"
                  disabled={autoLoading}
                >
                  Re-import anyway
                </button>
              </span>
            </div>
          )}

          {autoResult?.summary && (
            <ImportResultBox summary={autoResult.summary} filename={autoResult.filename} />
          )}
        </div>
      )}

      <div className="border-t border-gray-100" />

      {/* ── Manual upload fallback ──────────────────────────────────────────── */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">Manual File Upload</p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700 space-y-1 mb-3">
          <p className="font-semibold">How to get the file manually:</p>
          <ol className="list-decimal list-inside space-y-0.5 ml-1">
            <li>
              Register a free account at{' '}
              <a
                href="https://data-secure.comptroller.texas.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                data-secure.comptroller.texas.gov <ExternalLink size={9} />
              </a>
            </li>
            <li>Download the latest <code className="bg-blue-100 px-0.5 rounded">stpMM-DDph.zip</code></li>
            <li>Unzip and upload the extracted text/CSV file below (not the ZIP)</li>
          </ol>
        </div>

        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-300 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        >
          {manualLoading ? (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <Loader2 size={24} className="animate-spin text-blue-500" />
              <span className="text-sm">Importing permit phones…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Upload size={24} />
              <span className="text-sm font-medium text-gray-600">Drop the extracted permit file here</span>
              <span className="text-xs">or click to browse — CSV, TSV, or fixed-width text</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".txt,.csv,.tsv,.dat"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>

        {manualResult?.error && (
          <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{manualResult.error}</span>
          </div>
        )}

        {manualResult?.summary && (
          <div className="mt-3">
            <ImportResultBox summary={manualResult.summary} />
          </div>
        )}
      </div>
    </div>
  )
}

function ImportResultBox({ summary, filename }: { summary: ImportSummary; filename?: string }) {
  // Normalise field names from both auto (camelCase) and manual (snake_case) routes
  const rowsParsed  = summary.rowsParsed   ?? 0
  const matched     = summary.leadsMatched ?? summary.matched  ?? 0
  const phonesAdded = summary.phonesAdded  ?? summary.updated  ?? 0
  const skipped     = summary.phonesSkipped ?? summary.skipped ?? 0
  const noPhone     = summary.noPhone      ?? 0
  const errors      = summary.errorCount   ?? 0

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
        <CheckCircle size={14} />
        Import complete{filename && <span className="font-mono font-normal text-xs ml-1">{filename}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
        <div><dt className="text-gray-400 inline">Rows parsed: </dt><dd className="inline font-medium">{rowsParsed.toLocaleString()}</dd></div>
        <div><dt className="text-gray-400 inline">Leads matched: </dt><dd className="inline font-medium">{matched.toLocaleString()}</dd></div>
        <div><dt className="text-gray-400 inline">Phones saved: </dt><dd className="inline font-semibold text-green-700">{phonesAdded.toLocaleString()}</dd></div>
        <div><dt className="text-gray-400 inline">Skipped: </dt><dd className="inline">{(skipped + noPhone).toLocaleString()}</dd></div>
        {errors > 0 && (
          <div className="col-span-2"><dt className="text-red-400 inline">Errors: </dt><dd className="inline text-red-600">{errors}</dd></div>
        )}
      </dl>
    </div>
  )
}
