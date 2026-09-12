'use client'

import { useState } from 'react'

interface ApplyResult {
  ok?: boolean
  message?: string
  applied?: string[]
  results?: string[]
  errors?: string[]
  missing?: string[]
  manual?: boolean
  sql_blocks?: { label: string; sql: string }[]
}

export function ApplyMigrationsCard() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)

  async function run() {
    if (!window.confirm('Apply every pending additive migration? This never deletes or re-imports leads.')) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/apply-migration', { method: 'POST' })
      const json = await res.json()
      setResult(json)
    } catch (err) {
      setResult({ ok: false, message: String(err) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-medium text-gray-900">Database migrations</h2>
      <p className="text-sm text-gray-500">
        Applies missing additive schema updates (columns and tables only). Does not
        delete, truncate, or re-import leads.
      </p>
      <button
        onClick={run}
        disabled={running}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {running ? 'Applying…' : 'Apply pending migrations'}
      </button>
      {result && (
        <div className="text-sm bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1">
          <p className="font-medium text-gray-800">{result.message ?? (result.ok ? 'Done' : 'See details')}</p>
          {(result.results ?? result.applied ?? []).map(line => (
            <p key={line} className="text-xs text-gray-600">{line}</p>
          ))}
          {result.errors?.map(line => (
            <p key={line} className="text-xs text-red-600">{line}</p>
          ))}
          {result.manual && result.sql_blocks && result.sql_blocks.length > 0 && (
            <p className="text-xs text-amber-700">
              {result.sql_blocks.length} SQL block(s) need to be run in the Supabase SQL Editor
              (SUPABASE_ACCESS_TOKEN is not set on Netlify).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
