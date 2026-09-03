import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { TerritoryForm } from '@/components/settings/TerritoryForm'
import { ImportHistory } from '@/components/settings/ImportHistory'
import { ImportButton } from '@/components/ImportButton'
import { SiftImportCard } from '@/components/settings/SiftImportCard'
import { CpaApiKeyCard } from '@/components/settings/CpaApiKeyCard'
import type { Territory, ImportRun } from '@/lib/types'

export const metadata: Metadata = { title: 'Settings — Merchant Radar' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createServiceClient()

  const [{ data: territories }, { data: importRuns }] = await Promise.all([
    supabase.from('territories').select('*').eq('is_active', true).order('created_at'),
    supabase.from('import_runs').select('*, territory:territories(name)').order('started_at', { ascending: false }).limit(20),
  ])

  const primary = (territories ?? [])[0] as Territory | undefined

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      {/* Data Coverage (informational, locked) */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-900 mb-2">Data Coverage</h2>
        <p className="text-sm text-gray-600 mb-2">Texas Statewide — informational only (locked)</p>
        <p className="text-xs text-gray-400">All available Texas permit records will be imported into the database regardless of your selected working region. This setting is informational and cannot be changed from this UI.</p>
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Import Window</label>
          <div className="text-sm text-gray-600">7 / 14 / 30 days (adjust default below per Saved View)</div>
        </div>
      </div>

      {/* Saved View */}
      {primary && <TerritoryForm territory={primary} />}

      {/* Manual import */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-900 mb-1">Manual Import</h2>
        <p className="text-sm text-gray-500 mb-3">
          Pull the latest Texas sales-tax permits for your territory right now.
        </p>
        <ImportButton territory={primary ?? null} lastRun={(importRuns ?? [])[0] ?? null} />
      </div>

      {/* SIFT permit phone import */}
      <SiftImportCard />

      {/* CPA API key setup */}
      <CpaApiKeyCard />

      {/* Import History */}
      <ImportHistory runs={(importRuns ?? []) as (ImportRun & { territory?: { name: string } | null })[]} />

      {/* Connection info */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-600 space-y-1">
        <h2 className="font-medium text-gray-900 mb-2">Data Sources</h2>
        <p>Socrata dataset: <code className="text-xs bg-gray-100 px-1 rounded">jrea-zgmq</code></p>
        <p>Endpoint: <code className="text-xs bg-gray-100 px-1 rounded">https://data.texas.gov/resource/jrea-zgmq.json</code></p>
        <p className="text-gray-400 text-xs mt-2">
          Texas Open Data — Active Sales Tax Permit Holders. Filtered by outlet county code and permit issue date.
          Includes NAICS code. Does not include phone (phone is in the weekly SIFT file).
        </p>
        <p className="text-gray-400 text-xs mt-1">
          CPA API: <code className="text-xs bg-gray-100 px-1 rounded">https://api.comptroller.texas.gov/public-data/v1/public/</code>
          — franchise-tax officer data (requires <code className="text-xs bg-gray-100 px-1 rounded">CPA_API_KEY</code>).
        </p>
      </div>
    </div>
  )
}
