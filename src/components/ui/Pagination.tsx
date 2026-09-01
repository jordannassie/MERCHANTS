import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  currentPage: number
  totalPages: number
  filters: Record<string, string>
}

export function Pagination({ currentPage, totalPages, filters }: Props) {
  function pageHref(p: number) {
    const params = new URLSearchParams(filters)
    params.set('page', String(p))
    return `/leads?${params.toString()}`
  }

  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    if (totalPages <= 7) return i + 1
    if (currentPage <= 4) return i + 1
    if (currentPage >= totalPages - 3) return totalPages - 6 + i
    return currentPage - 3 + i
  })

  return (
    <div className="flex items-center justify-between">
      <Link
        href={pageHref(currentPage - 1)}
        aria-disabled={currentPage === 1}
        className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
          currentPage === 1
            ? 'pointer-events-none border-gray-200 text-gray-300'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <ChevronLeft size={14} /> Prev
      </Link>

      <div className="flex items-center gap-1">
        {pages.map(p => (
          <Link
            key={p}
            href={pageHref(p)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              p === currentPage
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p}
          </Link>
        ))}
      </div>

      <Link
        href={pageHref(currentPage + 1)}
        aria-disabled={currentPage === totalPages}
        className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
          currentPage === totalPages
            ? 'pointer-events-none border-gray-200 text-gray-300'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
      >
        Next <ChevronRight size={14} />
      </Link>
    </div>
  )
}
