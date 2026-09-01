import type { ImportRun } from '@/lib/types'
import { fmtDateTime, fmtDate } from '@/lib/utils'
import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'

interface Props {
  runs: (ImportRun & { territory?: { name: string } | null })[]
}

const STATUS_ICONS = {
  completed: { icon: CheckCircle2, color: 'text-green-500' },
  failed: { icon: XCircle, color: 'text-red-500' },
  running: { icon: Clock, color: 'text-blue-500' },
  partial: { icon: AlertTriangle, color: 'text-yellow-500' },
}

export function ImportHistory({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="font-medium text-gray-900 mb-2">Import History</h2>
        <p className="text-sm text-gray-400">No imports yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-medium text-gray-900">Import History</h2>
        <p className="text-xs text-gray-400 mt-0.5">Last {runs.length} runs</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Status', 'Territory', 'Date range', 'Started', 'Fetched', 'Inserted', 'Updated', 'Skipped'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {runs.map(run => {
              const { icon: Icon, color } = STATUS_ICONS[run.status] ?? STATUS_ICONS.failed
              return (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Icon size={12} className={color} />
                      <span className={color}>{run.status}</span>
                    </div>
                    {run.error_message && (
                      <p className="text-red-500 mt-0.5 max-w-xs truncate" title={run.error_message}>{run.error_message}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{run.territory?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtDate(run.requested_start_date)} →</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDateTime(run.started_at)}</td>
                  <td className="px-3 py-2 text-gray-700 font-medium">{run.fetched_count}</td>
                  <td className="px-3 py-2 text-green-700 font-medium">{run.inserted_count}</td>
                  <td className="px-3 py-2 text-blue-700 font-medium">{run.updated_count}</td>
                  <td className="px-3 py-2 text-gray-500">{run.skipped_count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
