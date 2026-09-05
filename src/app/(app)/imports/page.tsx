import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { ImportButton } from '@/components/ImportButton'
import { SiftImportCard } from '@/components/settings/SiftImportCard'
import { ImportHistory } from '@/components/settings/ImportHistory'
import { DiagnosticsPanel } from '@/components/imports/DiagnosticsPanel'
import { SiftRematchPanel } from '@/components/imports/SiftRematchPanel'
import { GoogleMapsSearchPanel } from '@/components/imports/GoogleMapsSearchPanel'
import type { Territory, ImportRun } from '@/lib/types'

export const metadata: Metadata = { title: 'Imports — Merchant Radar' }
export const dynamic = 'force-dynamic'

export default async function ImportsPage() {
  const db = createServiceClient()

  const [{ data: territories }, { data: importRuns }] = await Promise.all([
    db.from('territories').select('*').eq('is_active', true).limit(1),
    db.from('import_runs')
      .select('*, territory:territories(name)')
      .order('started_at', { ascending: false })
      .limit(20),
  ])

  const territory = (territories ?? [])[0] as Territory | undefined
  const lastRun = (importRuns ?? [])[0] as (ImportRun & { territory?: { name: string } | null }) | undefined

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Imports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Texas statewide permit data + SIFT phone matching</p>
        </div>
        <ImportButton territory={territory ?? null} lastRun={lastRun ?? null} />
      </div>

      {/* Live diagnostics — fetched client-side so counts are always fresh */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <DiagnosticsPanel />
      </div>

      {/* ── SIFT Re-match (force re-run against current DB) ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">SIFT Phone Re-match</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Re-processes the latest <code className="bg-gray-100 px-1 rounded">stpMM-DDph.zip</code> against
            all current leads using outlet phone → taxpayer phone fallback.
            Run this after importing Texas Leads to maximise callable count.
          </p>
        </div>
        <SiftRematchPanel />
      </div>

      {/* Step-by-step backfill guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold text-blue-900">Recommended order to maximise callable leads</p>
        <ol className="list-decimal list-inside space-y-1.5 text-blue-700">
          <li>
            <strong>Import Texas Leads</strong> (button top-right) — pulls ALL statewide permit businesses.
            Auto-loops through all batches. Runs SIFT re-match automatically when complete.
          </li>
          <li>
            <strong>Force Re-match SIFT</strong> (above) — re-matches the latest weekly phone file
            against all leads in the database using the fixed phone fallback parser.
            Safe to run multiple times; idempotent.
          </li>
          <li>
            If CPA_SIFT_API_KEY is not configured, <strong>upload the SIFT file manually</strong> below.
            The parser now uses outlet phone (col 15) first, taxpayer phone (col 8) as fallback — 
            ~4,561 of 4,589 rows will have a valid phone.
          </li>
        </ol>
      </div>

      {/* SIFT phone import (manual upload fallback) */}
      <SiftImportCard />

      {/* ── Google Maps Business Search ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <GoogleMapsSearchPanel />
      </div>

      {/* Import history */}
      <ImportHistory runs={(importRuns ?? []) as (ImportRun & { territory?: { name: string } | null })[]} />
    </div>
  )
}
