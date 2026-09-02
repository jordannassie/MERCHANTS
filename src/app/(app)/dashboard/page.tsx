import { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { fmtDate, fmtPhone } from '@/lib/utils'
import { ImportButton } from '@/components/ImportButton'
import { Users, Flame, CalendarClock, Calendar, Phone, ArrowDown, Pencil, ChevronsRight } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard — Merchant Radar' }
export const dynamic = 'force-dynamic'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function ScoreBadge({ score, priority }: { score: number; priority: string }) {
  const cfg = priority === 'hot'
    ? 'bg-red-500 text-white'
    : priority === 'good'
    ? 'bg-orange-400 text-white'
    : 'bg-gray-300 text-gray-700'

  const label = priority === 'hot' ? 'HOT' : priority === 'good' ? 'GOOD' : priority === 'low' ? 'OKAY' : 'SKIP'

  return (
    <div className="flex flex-col items-center gap-0.5 w-12">
      <span className={`text-sm font-bold w-9 h-9 rounded-full flex items-center justify-center ${cfg}`}>{score}</span>
      <span className={`text-[10px] font-semibold tracking-wide ${priority === 'hot' ? 'text-red-500' : priority === 'good' ? 'text-orange-400' : 'text-gray-400'}`}>{label}</span>
    </div>
  )
}

export default async function DashboardPage() {
  const db = createServiceClient()

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)

  const [
    { count: totalLeads },
    { count: hotLeads },
    { count: followUpsDue },
    { count: appointments },
    { data: topLeads },
    { data: todayFollowUps },
    { data: lastImportArr },
    { data: territory },
  ] = await Promise.all([
    db.from('leads').select('*', { count: 'exact', head: true }),
    db.from('leads').select('*', { count: 'exact', head: true }).eq('priority', 'hot').not('status', 'in', '(won,lost,do_not_contact)').not('category', 'eq', 'corporate_chain'),
    db.from('leads').select('*', { count: 'exact', head: true }).lte('next_follow_up_at', todayEnd.toISOString()).not('status', 'in', '(won,lost,do_not_contact)'),
    db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'appointment'),
    db.from('leads').select('id,display_name,outlet_name,outlet_city,outlet_state,priority,status,score,primary_phone,permit_issue_date,first_sales_date,naics_code,google_place_id,enrichment_status,category').not('status', 'in', '(won,lost,do_not_contact)').not('category', 'eq', 'corporate_chain').order('score', { ascending: false }).limit(5),
    db.from('leads').select('id,display_name,outlet_city,outlet_state,primary_phone,next_follow_up_at,status,naics_code').lte('next_follow_up_at', todayEnd.toISOString()).gte('next_follow_up_at', todayStart.toISOString()).order('next_follow_up_at').limit(6),
    db.from('import_runs').select('*').order('started_at', { ascending: false }).limit(1),
    db.from('territories').select('*').eq('is_active', true).limit(1),
  ])

  const firstName = 'Jordan'
  const lastRun = lastImportArr?.[0] ?? null
  const activeTerritory = territory?.[0] ?? null

  const stats = [
    { label: 'New Leads', value: totalLeads ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50', href: '/leads' },
    { label: 'Hot Leads', value: hotLeads ?? 0, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50', href: '/leads?priority=hot' },
    { label: 'Follow-ups Today', value: followUpsDue ?? 0, icon: CalendarClock, color: 'text-blue-500', bg: 'bg-blue-50', href: '/follow-ups' },
    { label: 'Appointments', value: appointments ?? 0, icon: Calendar, color: 'text-purple-500', bg: 'bg-purple-50', href: '/pipeline' },
  ]

  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{greeting()}, {firstName}</h1>
        <ImportButton territory={activeTerritory} lastRun={lastRun} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:border-blue-200 transition-colors">
            <div className={`${s.bg} p-3 rounded-xl`}>
              <s.icon size={20} className={s.color} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid md:grid-cols-5 gap-6">

        {/* Today's Best Leads — 3/5 width */}
        <div className="md:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">Today&apos;s Best Leads</h2>
            <Link href="/leads" className="text-xs text-blue-600 hover:underline">View all →</Link>
          </div>

          {topLeads && topLeads.length > 0 ? (
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[52px]" />
                <col />
                <col className="w-[80px]" />
                <col className="w-[72px]" />
                <col className="w-[110px]" />
                <col className="w-[80px]" />
              </colgroup>
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-50">
                  <th className="px-3 py-3 text-left">Score</th>
                  <th className="px-3 py-3 text-left">Business</th>
                  <th className="px-3 py-3 text-left">City</th>
                  <th className="px-3 py-3 text-left">First Sale</th>
                  <th className="px-3 py-3 text-left">Contact</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topLeads.map(lead => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3">
                      <ScoreBadge score={lead.score} priority={lead.priority} />
                    </td>
                    <td className="px-3 py-3 min-w-0">
                      <Link href={`/leads/${lead.id}`} className="hover:text-blue-600 block">
                        <p className="font-medium text-gray-900 leading-snug line-clamp-2 break-words">
                          {lead.display_name || lead.outlet_name || '—'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {lead.category || (lead.naics_code ? `NAICS ${lead.naics_code}` : '')}
                        </p>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 leading-snug">
                      <span className="line-clamp-2">{lead.outlet_city}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {lead.first_sales_date ? (
                        <span className={new Date(lead.first_sales_date) >= new Date() ? 'text-green-600 font-medium' : ''}>
                          {fmtDate(lead.first_sales_date)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-3">
                      {lead.primary_phone ? (
                        <a href={`tel:${lead.primary_phone}`}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <Phone size={11} /> {fmtPhone(lead.primary_phone)}
                        </a>
                      ) : (
                        <Link href={`/leads/${lead.id}`}
                          className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1">
                          <Phone size={10} className="opacity-40" />
                          Find Contact
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {lead.primary_phone ? (
                        <a href={`tel:${lead.primary_phone}`}
                          className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          <Phone size={11} /> Call
                        </a>
                      ) : (
                        <Link href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          Find
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-10 text-sm text-gray-400 text-center">No leads yet — import Texas permits to get started.</p>
          )}
        </div>

        {/* Right column — 2/5 width */}
        <div className="md:col-span-2 space-y-4">

          {/* Follow Up Today */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-900">Follow Up Today</h2>
              <Link href="/follow-ups" className="text-xs text-blue-600 hover:underline">View all →</Link>
            </div>

            {todayFollowUps && todayFollowUps.length > 0 ? (
              <ul className="divide-y divide-gray-50">
                {todayFollowUps.map(lead => (
                  <li key={lead.id}>
                    <Link href={`/leads/${lead.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-blue-700 text-xs font-bold">{(lead.display_name || 'L')[0].toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.display_name || '(Unnamed)'}</p>
                        <p className="text-xs text-gray-500">{lead.outlet_city}{lead.outlet_state ? `, ${lead.outlet_state}` : ''}</p>
                        {lead.primary_phone && (
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Phone size={10} /> {fmtPhone(lead.primary_phone)}
                          </p>
                        )}
                      </div>
                      {lead.next_follow_up_at && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {new Date(lead.next_follow_up_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No follow-ups due today.</p>
            )}
          </div>

          {/* Latest Texas Import */}
          {lastRun && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Latest Texas Import</h2>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  lastRun.status === 'completed' ? 'bg-green-100 text-green-700' :
                  lastRun.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {lastRun.status.charAt(0).toUpperCase() + lastRun.status.slice(1)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-1">
                    <ArrowDown size={14} className="text-blue-500" />
                  </div>
                  <p className="text-lg font-bold text-gray-900">{lastRun.inserted_count ?? 0}</p>
                  <p className="text-xs text-gray-400">Imported</p>
                </div>
                <div className="text-center">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-1">
                    <Pencil size={14} className="text-green-500" />
                  </div>
                  <p className="text-lg font-bold text-gray-900">{lastRun.updated_count ?? 0}</p>
                  <p className="text-xs text-gray-400">Updated</p>
                </div>
                <div className="text-center">
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-1">
                    <ChevronsRight size={14} className="text-gray-400" />
                  </div>
                  <p className="text-lg font-bold text-gray-900">{lastRun.skipped_count ?? 0}</p>
                  <p className="text-xs text-gray-400">Skipped</p>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                {new Date(lastRun.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {activeTerritory ? ` · ${activeTerritory.name}` : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

