'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Phone } from 'lucide-react'

interface Props {
  hasPhone: boolean
  totalCount: number
  callableCount: number
}

export function PipelineFilterBar({ hasPhone, totalCount, callableCount }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function setFilter(value: boolean) {
    const params = new URLSearchParams()
    if (!value) params.set('hasPhone', 'false')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const count = hasPhone ? callableCount : totalCount

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-xs text-gray-500 font-medium mr-1">Show:</span>

      <button
        onClick={() => setFilter(true)}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
          hasPhone
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
        }`}
      >
        <Phone size={11} /> Has phone
        {hasPhone && (
          <span className="ml-0.5 bg-white/20 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
            {callableCount}
          </span>
        )}
      </button>

      <button
        onClick={() => setFilter(false)}
        className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
          !hasPhone
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
        }`}
      >
        Show all {!hasPhone && <span className="ml-0.5 opacity-75">({totalCount})</span>}
      </button>

      <span className="text-xs text-gray-400 ml-auto">
        {count} lead{count !== 1 ? 's' : ''} across pipeline
      </span>
    </div>
  )
}
