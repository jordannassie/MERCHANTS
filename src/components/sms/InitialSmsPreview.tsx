'use client'

import { STOP_LINE } from '@/lib/outreach'

export function InitialSmsPreview({ message }: { message: string }) {
  const lines = message.split('\n')

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        const isStop = trimmed === STOP_LINE
        const isUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed === '{PROPOSAL_URL}'
        return (
          <span
            key={`${i}-${line}`}
            className={
              isStop
                ? 'font-semibold text-red-700 bg-red-50'
                : isUrl
                  ? 'font-mono text-blue-700 bg-blue-50'
                  : undefined
            }
          >
            {line}
            {i < lines.length - 1 ? '\n' : ''}
          </span>
        )
      })}
    </div>
  )
}
