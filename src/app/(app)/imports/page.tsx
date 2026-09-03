import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { ImportButton } from '@/components/ImportButton'
import { SiftImportCard } from '@/components/settings/SiftImportCard'
import { ImportHistory } from '@/components/settings/ImportHistory'
import { DiagnosticsPanel } from '@/components/imports/DiagnosticsPanel'
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

      {/* Step-by-step backfill guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold text-blue-900">Backfill order — run these steps once to get all Texas phones</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>
            <strong>Import Texas Leads</strong> — pulls ALL statewide permit businesses for your import window.
            Can be run multiple times; each run is additive and idempotent.
            If it times out, click again to continue from where it stopped.
          </li>
          <li>
            <strong>Upload SIFT file</strong> below — upload <code className="bg-blue-100 px-1 rounded">stp08-31ph.zip</code> (or extracted CSV).
            Phones are now matched against the full statewide permit set.
          </li>
          <li>
            Check diagnostics above — <strong>Unmatched</strong> should now be near zero.
            Re-upload the SIFT file again if needed (safe to re-run; duplicates are skipped).
          </li>
        </ol>
      </div>

      {/* SIFT phone import */}
      <SiftImportCard />

      {/* Import history */}
      <ImportHistory runs={(importRuns ?? []) as (ImportRun & { territory?: { name: string } | null })[]} />
    </div>
  )
}
