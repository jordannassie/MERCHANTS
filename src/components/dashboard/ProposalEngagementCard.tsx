'use client'

import { useState } from 'react'
import Link from 'next/link'

export interface ProposalEngagementData {
  uniqueViewers: number
  totalViews: number
  smsSent: number
  agreements: number
}

interface Props {
  today: ProposalEngagementData
  allTime: ProposalEngagementData
}

export function ProposalEngagementCard({ today, allTime }: Props) {
  const [mode, setMode] = useState<'today' | 'allTime'>('today')
  const data = mode === 'today' ? today : allTime

  const clickRate = data.smsSent > 0
    ? Math.round((data.uniqueViewers / data.smsSent) * 100)
    : 0
  const clickRateStr = data.smsSent > 0 ? `${clickRate}%` : '—'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header + toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          📊 Proposal Engagement
        </h2>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setMode('today')}
            className={`text-xs px-3 py-1 font-medium transition-colors ${
              mode === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setMode('allTime')}
            className={`text-xs px-3 py-1 font-medium border-l border-gray-200 transition-colors ${
              mode === 'allTime'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* 2×2 metric grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Unique Viewers */}
        <Link
          href="/leads?proposalActivity=viewed"
          className={`rounded-xl border p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow ${
            data.uniqueViewers > 0
              ? 'bg-blue-50 border-blue-100'
              : 'bg-gray-50 border-gray-100'
          }`}
        >
          <span className={`text-xs font-medium ${data.uniqueViewers > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
            👁 Proposal Clicked
          </span>
          <span className={`text-3xl font-bold ${data.uniqueViewers > 0 ? 'text-blue-700' : 'text-gray-700'}`}>
            {data.uniqueViewers.toLocaleString()}
          </span>
        </Link>

        {/* Total Views */}
        <div
          className={`rounded-xl border p-4 flex flex-col gap-1 ${
            data.totalViews > 0
              ? 'bg-purple-50 border-purple-100'
              : 'bg-gray-50 border-gray-100'
          }`}
        >
          <span className={`text-xs font-medium ${data.totalViews > 0 ? 'text-purple-600' : 'text-gray-500'}`}>
            📊 Total Views
          </span>
          <span className={`text-3xl font-bold ${data.totalViews > 0 ? 'text-purple-700' : 'text-gray-700'}`}>
            {data.totalViews.toLocaleString()}
          </span>
        </div>

        {/* Click Rate */}
        <div
          className={`rounded-xl border p-4 flex flex-col gap-1 ${
            clickRate > 0
              ? 'bg-amber-50 border-amber-100'
              : 'bg-gray-50 border-gray-100'
          }`}
        >
          <span className={`text-xs font-medium ${clickRate > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
            🎯 Click Rate
          </span>
          <span className={`text-3xl font-bold ${clickRate > 0 ? 'text-amber-700' : 'text-gray-700'}`}>
            {clickRateStr}
          </span>
        </div>

        {/* Agreements */}
        <Link
          href="/leads?proposalActivity=agreement"
          className={`rounded-xl border p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow ${
            data.agreements > 0
              ? 'bg-green-50 border-green-100'
              : 'bg-gray-50 border-gray-100'
          }`}
        >
          <span className={`text-xs font-medium ${data.agreements > 0 ? 'text-green-600' : 'text-gray-500'}`}>
            ✍️ Agreements
          </span>
          <span className={`text-3xl font-bold ${data.agreements > 0 ? 'text-green-700' : 'text-gray-700'}`}>
            {data.agreements.toLocaleString()}
          </span>
        </Link>
      </div>

      {/* SMS Sent sub-label */}
      <p className="text-xs text-gray-400 mt-3">
        {mode === 'today' ? 'SMS Sent Today' : 'SMS Sent (All Time)'}:{' '}
        <span className="font-semibold text-gray-600">{data.smsSent.toLocaleString()}</span>
      </p>
    </div>
  )
}
