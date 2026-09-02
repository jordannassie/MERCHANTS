'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props {
  label?: string
  className?: string
}

export function RefreshButton({ label = 'Refresh', className }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      title="Refresh data"
      className={
        className ??
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-lg bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
      }
    >
      <RefreshCw size={13} className={isPending ? 'animate-spin' : ''} />
      {isPending ? 'Refreshing…' : label}
    </button>
  )
}
