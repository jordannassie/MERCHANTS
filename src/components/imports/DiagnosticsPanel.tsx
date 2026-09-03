'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { RefreshCw, AlertCircle } from 'lucide-react'

interface DiagData {
  database: {
    total: number
    withPhone: number
    withoutPhone: number
    withPermitPhone: number
    withPrimaryPhone: number
  }
  regions: Record<string, number>
  lastImport: {
    status: string
    fetched_count: number
    inserted_count: number
    updated_count: number
    skipped_count: number
    error_message: string | null
    started_at: string
    completed_at: string | null
    county_codes: string[] | null
  } | null
  lastSift: {
    filename: string
    status: string
    records_parsed: number
    leads_matched: number
    phones_added: number
    phones_skipped: number
    imported_at: string
    error_message: string | null
  } | null
}

const REGION_ORDER = ['DFW', 'Houston', 'Austin', 'San Antonio', 'El Paso', 'Other Texas', 'All Texas']

export function DiagnosticsPanel() {
  const [data, setData] = useState<DiagData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/diagnostics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setLastRefreshed(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load diagnostics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const db = data?.database
  const lastSift = data?.lastSift
  const lastImport = data?.lastImport
  const siftUnmatched = lastSift
    ? (lastSift.records_parsed ?? 0) - (lastSift.leads_matched ?? 0)
    : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 text-base">Live Diagnostics</h2>
          {lastRefreshed && (
            <p className="text-xs text-gray-400 mt-0.5">
              Updated {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── TEXAS DATABASE ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Texas Database</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'Total businesses', value: db?.total, highlight: false },
            { label: 'With any phone', value: db?.withPhone, highlight: true },
            { label: 'Permit phone', value: db?.withPermitPhone, highlight: false },
            { label: 'Primary phone', value: db?.withPrimaryPhone, highlight: false },
            { label: 'No phone', value: db?.withoutPhone, highlight: false, muted: true },
          ].map(s => (
            <div key={s.label} className="text-center bg-gray-50 rounded-xl p-3">
              <p className={`text-xl font-bold ${s.highlight ? 'text-blue-600' : s.muted ? 'text-gray-400' : 'text-gray-800'}`}>
                {loading ? '—' : (s.value ?? 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── REGION CALLABLE COUNTS ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Callable leads by region</p>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {REGION_ORDER.map(region => {
            const count = data?.regions?.[region] ?? 0
            const isAll = region === 'All Texas'
            return (
              <Link
                key={region}
                href={`/leads?region=${encodeURIComponent(region)}&status=new`}
                className={`text-center rounded-xl p-2.5 transition-colors ${
                  isAll
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-50 hover:bg-blue-100'
                }`}
              >
                <p className={`text-lg font-bold ${isAll ? 'text-white' : 'text-blue-700'}`}>
                  {loading ? '—' : count.toLocaleString()}
                </p>
                <p className={`text-[10px] leading-tight ${isAll ? 'text-blue-100' : 'text-blue-600'}`}>
                  {region}
                </p>
              </Link>
            )
          })}
        </div>
        {!loading && db && (
          <p className="text-xs text-gray-400 mt-2">
            Clicking a region opens the live leads queue for that area.
          </p>
        )}
      </div>

      {/* ── LATEST SIFT FILE ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Latest SIFT phone file</p>
        {lastSift ? (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800 font-mono">{lastSift.filename?.replace(/^.*\//, '')}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Imported {new Date(lastSift.imported_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                lastSift.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {lastSift.status}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { label: 'Rows parsed', value: lastSift.records_parsed },
                { label: 'Matched', value: lastSift.leads_matched },
                { label: 'Phones added', value: lastSift.phones_added, highlight: true },
                { label: 'Unmatched', value: siftUnmatched, warn: (siftUnmatched ?? 0) > 0 },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg p-2 border border-gray-100">
                  <p className={`text-lg font-bold ${
                    s.highlight ? 'text-green-600' : s.warn ? 'text-amber-600' : 'text-gray-800'
                  }`}>
                    {(s.value ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {(siftUnmatched ?? 0) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                <strong>{siftUnmatched?.toLocaleString()} unmatched rows</strong> — these SIFT records had no
                matching permit business in the database. Run <strong>Import Texas Leads</strong> first
                (pulls statewide permit records), then re-upload this SIFT file to match phones against
                the full statewide set.
              </div>
            )}

            {lastSift.error_message && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                {lastSift.error_message}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-400 text-center">
            No SIFT file imported yet — upload <code>stpMM-DDph.zip</code> below.
          </div>
        )}
      </div>

      {/* ── LATEST PERMIT IMPORT ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Latest Texas permit import</p>
        {lastImport ? (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {lastImport.county_codes?.length === 0
                    ? 'All Texas (statewide)'
                    : `${lastImport.county_codes?.length ?? 0} counties`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(lastImport.started_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                lastImport.status === 'completed' ? 'bg-green-100 text-green-700' :
                lastImport.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>
                {lastImport.status}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Fetched', value: lastImport.fetched_count },
                { label: 'New', value: lastImport.inserted_count, highlight: true },
                { label: 'Updated', value: lastImport.updated_count },
                { label: 'Skipped', value: lastImport.skipped_count },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg p-2 border border-gray-100">
                  <p className={`text-lg font-bold ${s.highlight ? 'text-blue-600' : 'text-gray-800'}`}>
                    {(s.value ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>

            {lastImport.status === 'partial' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {lastImport.error_message ?? 'Import was partial — click Import Texas Leads again to continue.'}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-400 text-center">
            No import run yet — click <strong>Import Texas Leads</strong> to start.
          </div>
        )}
      </div>
    </div>
  )
}
