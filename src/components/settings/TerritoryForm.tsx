'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Territory } from '@/lib/types'
import { DFW_COUNTIES } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { updateTerritory } from '@/lib/actions/territory'

interface Props { territory: Territory }

export function TerritoryForm({ territory }: Props) {
  const router = useRouter()
  const [name, setName] = useState(territory.name)
  const [countyCodes, setCountyCodes] = useState<string[]>(territory.county_codes)
  const [daysToImport, setDaysToImport] = useState(territory.days_to_import)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggleCounty(code: string) {
    setCountyCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  async function save() {
    setLoading(true)
    await updateTerritory(territory.id, { name, county_codes: countyCodes, days_to_import: daysToImport })
    setLoading(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="font-medium text-gray-900 mb-4">Territory Settings</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Territory Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Import Window
          </label>
          <div className="flex gap-2">
            {[7, 14, 30].map(d => (
              <button key={d} type="button" onClick={() => setDaysToImport(d)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${daysToImport === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                {d} days
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Counties ({countyCodes.length} selected)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DFW_COUNTIES).map(([code, name]) => (
              <label key={code} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={countyCodes.includes(code)} onChange={() => toggleCounty(code)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-gray-700">{name}</span>
                <span className="text-gray-400 text-xs">({code})</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Hood (111) and Somervell (213) can be added here.</p>
        </div>

        <Button variant="primary" onClick={save} loading={loading}>
          {saved ? '✓ Saved' : 'Save Territory'}
        </Button>
      </div>
    </div>
  )
}
