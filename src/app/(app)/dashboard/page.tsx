/**
 * Dashboard — simple sales scoreboard.
 *
 * Only COUNT queries — no row fetching, no lead tables, no import diagnostics.
 * Filters by region (URL param ?region=) which NEVER affects imports.
 */

import { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { getRegionCounties } from '@/lib/regions'

export const metadata: Metadata = { title: 'Dashboard — Merchant Radar' }
export const dynamic = 'force-dynamic'

const REGIONS = ['DFW', 'Houston', 'Austin', 'San Antonio', 'All Texas'] as const
type Region = typeof REGIONS[number]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Status card config ────────────────────────────────────────────────────────

const STATUS_CARDS = [
  { key: 'new',           label: 'New Leads',       href: '/leads?status=new',         color: 'blue'    },
  { key: 'callable',      label: 'Callable',         href: '/leads?status=new',         color: 'green'   },
  { key: 'attempted',     label: 'Attempted',        href: '/leads?status=attempted',   color: 'orange'  },
  { key: 'connected',     label: 'Connected',        href: '/leads?status=connected',   color: 'purple'  },
  { key: 'follow_up',     label: 'Follow-up',        href: '/leads?status=follow_up',   color: 'yellow'  },
  { key: 'appointment',   label: 'Appointments',     href: '/leads?status=appointment', color: 'indigo'  },
  { key: 'won',           label: 'Won',              href: '/leads?status=won',         color: 'emerald' },
  { key: 'lost_dnc',      label: 'Lost / DNC',       href: '/leads?status=lost',        color: 'gray'    },
] as const

const PIPELINE_ROWS = [
  { key: 'new',         label: 'New',         href: '/leads?status=new'         },
  { key: 'attempted',   label: 'Attempted',   href: '/leads?status=attempted'   },
  { key: 'connected',   label: 'Connected',   href: '/leads?status=connected'   },
  { key: 'follow_up',   label: 'Follow-up',   href: '/leads?status=follow_up'   },
  { key: 'appointment', label: 'Appointment', href: '/leads?status=appointment' },
  { key: 'won',         label: 'Won',         href: '/leads?status=won'         },
  { key: 'lost_dnc',    label: 'Lost / DNC',  href: '/leads?status=lost'        },
] as const

// Color classes per card color name
const COLOR_MAP: Record<string, { bg: string; text: string; num: string; border: string }> = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    num: 'text-blue-700',    border: 'border-blue-100'    },
  green:   { bg: 'bg-green-50',   text: 'text-green-600',   num: 'text-green-700',   border: 'border-green-100'   },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-600',  num: 'text-orange-700',  border: 'border-orange-100'  },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-600',  num: 'text-purple-700',  border: 'border-purple-100'  },
  yellow:  { bg: 'bg-yellow-50',  text: 'text-yellow-600',  num: 'text-yellow-700',  border: 'border-yellow-100'  },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  num: 'text-indigo-700',  border: 'border-indigo-100'  },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', num: 'text-emerald-700', border: 'border-emerald-100' },
  gray:    { bg: 'bg-gray-50',    text: 'text-gray-500',    num: 'text-gray-700',    border: 'border-gray-100'    },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp     = await searchParams
  const region = (REGIONS.includes(sp.region as Region) ? sp.region : 'DFW') as Region

  // Counties for this region — empty array = All Texas (no county filter)
  const counties = region === 'All Texas' ? [] : getRegionCounties(region)

  const db = createServiceClient()

  // ── COUNT queries — all parallel, no rows fetched ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function withCounty(q: any): any {
    return counties.length > 0 ? q.in('outlet_county_code', counties) : q
  }

  const [
    { count: cNew },
    { count: cCallable },
    { count: cAttempted },
    { count: cConnected },
    { count: cFollowUp },
    { count: cAppointment },
    { count: cWon },
    { count: cLostDNC },
  ] = await Promise.all([
    withCounty(db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new')),

    withCounty(
      db.from('leads').select('*', { count: 'exact', head: true })
        .eq('status', 'new')
        .or('permit_phone.not.is.null,primary_phone.not.is.null')
    ),

    withCounty(db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'attempted')),
    withCounty(db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'connected')),
    withCounty(db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'follow_up')),
    withCounty(db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'appointment')),
    withCounty(db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'won')),

    withCounty(
      db.from('leads').select('*', { count: 'exact', head: true })
        .in('status', ['lost', 'do_not_contact'])
    ),
  ])

  // Map key → count
  const counts: Record<string, number> = {
    new:         cNew         ?? 0,
    callable:    cCallable    ?? 0,
    attempted:   cAttempted   ?? 0,
    connected:   cConnected   ?? 0,
    follow_up:   cFollowUp    ?? 0,
    appointment: cAppointment ?? 0,
    won:         cWon         ?? 0,
    lost_dnc:    cLostDNC     ?? 0,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {greeting()}, Jordan
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Sales scoreboard · {region}</p>
      </div>

      {/* ── Region tabs ── */}
      <div className="flex flex-wrap gap-1.5">
        {REGIONS.map(r => {
          const active = r === region
          return (
            <Link
              key={r}
              href={r === 'DFW' ? '/dashboard' : `/dashboard?region=${encodeURIComponent(r)}`}
              className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {r}
            </Link>
          )
        })}
      </div>

      {/* ── Status cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUS_CARDS.map(card => {
          const c   = COLOR_MAP[card.color]
          const val = counts[card.key] ?? 0
          return (
            <Link
              key={card.key}
              href={card.href}
              className={`rounded-xl border ${c.border} ${c.bg} p-4 flex flex-col gap-1 hover:shadow-sm transition-shadow`}
            >
              <span className={`text-xs font-medium ${c.text}`}>{card.label}</span>
              <span className={`text-3xl font-bold ${c.num}`}>{val.toLocaleString()}</span>
            </Link>
          )
        })}
      </div>

      {/* ── Pipeline summary ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Pipeline</h2>
        <div className="space-y-0">
          {PIPELINE_ROWS.map((row, i) => {
            const val = counts[row.key] ?? 0
            const maxVal = Math.max(...PIPELINE_ROWS.map(r => counts[r.key] ?? 0), 1)
            const pct = Math.round((val / maxVal) * 100)
            return (
              <Link
                key={row.key}
                href={row.href}
                className={`flex items-center gap-3 py-2.5 ${i < PIPELINE_ROWS.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 -mx-2 px-2 rounded transition-colors`}
              >
                <span className="w-24 text-sm text-gray-500 shrink-0">{row.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0">
                  <div
                    className="h-2 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-sm font-semibold text-gray-800 text-right shrink-0">
                  {val.toLocaleString()}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Follow-up count (simple, no list) ── */}
      {(counts.follow_up ?? 0) > 0 && (
        <Link
          href="/leads?status=follow_up"
          className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-3.5 hover:bg-yellow-100 transition-colors"
        >
          <span className="text-sm font-medium text-yellow-800">
            Follow-ups pending
          </span>
          <span className="text-lg font-bold text-yellow-700">
            {(counts.follow_up).toLocaleString()} →
          </span>
        </Link>
      )}

      {(counts.appointment ?? 0) > 0 && (
        <Link
          href="/leads?status=appointment"
          className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3.5 hover:bg-indigo-100 transition-colors"
        >
          <span className="text-sm font-medium text-indigo-800">
            Appointments scheduled
          </span>
          <span className="text-lg font-bold text-indigo-700">
            {(counts.appointment).toLocaleString()} →
          </span>
        </Link>
      )}

    </div>
  )
}
