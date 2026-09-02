'use client'

import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react'

interface ImportSummary {
  format: string
  phoneColFound: boolean
  rowsParsed: number
  noPhone: number
  matched: number
  updated: number
  skipped: number
  errorCount: number
}

export function SiftImportCard() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ summary?: ImportSummary; error?: string } | null>(null)

  async function handleFile(file: File) {
    if (!file) return
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/import/sift-permits', { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok) {
        setResult({ summary: json.summary })
      } else {
        setResult({ error: json.error ?? 'Import failed' })
      }
    } catch (e) {
      setResult({ error: String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-medium text-gray-900 mb-1">Texas Permit Phone Import (SIFT)</h2>
      <p className="text-sm text-gray-500 mb-3">
        Import business phone numbers from the Texas Comptroller&apos;s weekly new-permit file.
        The <code className="text-xs bg-gray-100 px-1 rounded">stpMM-DDph.zip</code> file (with phone)
        includes the permittee&apos;s telephone number — a legally required public disclosure.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700 space-y-1 mb-3">
        <p className="font-semibold">How to get the file:</p>
        <ol className="list-decimal list-inside space-y-0.5 ml-1">
          <li>
            Register a free account at{' '}
            <a href="https://data-secure.comptroller.texas.gov/" target="_blank" rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5">
              data-secure.comptroller.texas.gov <ExternalLink size={9} />
            </a>
          </li>
          <li>Download the latest <code className="bg-blue-100 px-0.5 rounded">stpMM-DDph.zip</code> (weekly new permits with phone)</li>
          <li>Unzip and upload the extracted text/CSV file below (not the ZIP)</li>
        </ol>
        <p className="text-blue-600 mt-1">
          Permit phones are stored separately from manually entered phones and never overwrite CRM data.
        </p>
      </div>

      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-300 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        {loading ? (
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

      {/* Result */}
      {result?.error && (
        <div className="mt-3 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{result.error}</span>
        </div>
      )}

      {result?.summary && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
            <CheckCircle size={14} />
            Import complete
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600 mt-1">
            <div><dt className="text-gray-400 inline">Rows parsed: </dt><dd className="inline font-medium">{result.summary.rowsParsed.toLocaleString()}</dd></div>
            <div><dt className="text-gray-400 inline">Matched leads: </dt><dd className="inline font-medium">{result.summary.matched.toLocaleString()}</dd></div>
            <div><dt className="text-gray-400 inline">Phones saved: </dt><dd className="inline font-semibold text-green-700">{result.summary.updated.toLocaleString()}</dd></div>
            <div><dt className="text-gray-400 inline">No phone: </dt><dd className="inline">{result.summary.noPhone.toLocaleString()}</dd></div>
            <div><dt className="text-gray-400 inline">File format: </dt><dd className="inline font-mono">{result.summary.format}</dd></div>
            <div><dt className="text-gray-400 inline">Errors: </dt><dd className="inline">{result.summary.errorCount}</dd></div>
          </dl>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Permit phones are displayed as &ldquo;Texas permit phone&rdquo; in the UI and are never labeled as an owner&apos;s personal number.
        Source attribution is stored with each record.
      </p>
    </div>
  )
}
