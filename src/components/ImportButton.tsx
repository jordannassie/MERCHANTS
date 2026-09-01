'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import type { Territory, ImportRun } from '@/lib/types'
import { fmtRelative } from '@/lib/utils'
import { DFW_COUNTIES } from '@/lib/constants'
import { useRouter } from 'next/navigation'

interface Props {
  territory: Territory | null
  lastRun: ImportRun | null
}

export function ImportButton({ territory, lastRun }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runImport() {
    if (!territory) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/import/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ territoryId: territory.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')
      setResult(json.run)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => { setOpen(true); setResult(null); setError(null) }}
        className="flex items-center gap-2"
      >
        <RefreshCw size={14} />
        Import Texas Leads
      </Button>

      <Dialog open={open} onClose={() => { if (!loading) setOpen(false) }} title="Import Texas Leads" size="sm">
        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              <p className="font-medium mb-1">Import complete</p>
              <ul className="space-y-0.5 text-green-700">
                <li>Fetched: <strong>{result.fetched_count}</strong></li>
                <li>Inserted: <strong>{result.inserted_count}</strong></li>
                <li>Updated: <strong>{result.updated_count}</strong></li>
                <li>Skipped: <strong>{result.skipped_count}</strong></li>
              </ul>
            </div>
            <Button variant="primary" className="w-full" onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {territory ? (
              <>
                <div className="text-sm text-gray-700 space-y-2">
                  <p><span className="text-gray-500">Territory:</span> <strong>{territory.name}</strong></p>
                  <p><span className="text-gray-500">Date range:</span> <strong>Last {territory.days_to_import} days</strong></p>
                  <p><span className="text-gray-500">Counties:</span>{' '}
                    <span className="text-gray-900">
                      {territory.county_codes.map(c => DFW_COUNTIES[c] ?? c).join(', ')}
                    </span>
                  </p>
                  {lastRun && (
                    <p className="text-gray-400 text-xs">Last run: {fmtRelative(lastRun.started_at)}</p>
                  )}
                </div>
                {error && (
                  <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
                  <Button variant="primary" className="flex-1" onClick={runImport} loading={loading}>
                    {loading ? 'Importing…' : 'Run Import'}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">No active territory found. Configure one in Settings.</p>
            )}
          </div>
        )}
      </Dialog>
    </>
  )
}
