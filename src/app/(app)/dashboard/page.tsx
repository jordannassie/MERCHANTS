import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtRelative, STATUS_COLORS, PRIORITY_COLORS } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { ImportButton } from '@/components/ImportButton'
import { Flame, Calendar, Trophy, Star, Clock, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard — Merchant Radar' }

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [
    { count: totalLeads },
    { count: hotLeads },
    { count: followUpsDue },
    { count: appointments },
    { count: wonAccounts },
    { data: topHot },
    { data: todayFollowUps },
    { data: lastImport },
    { data: territory },
    { data: openingSoon },
  ] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('owner_id', user.id),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('priority', 'hot').not('status', 'in', '(won,lost,do_not_contact)'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).lte('next_follow_up_at', new Date().toISOString()).not('status', 'in', '(won,lost,do_not_contact)'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('status', 'appointment'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('owner_id', user.id).eq('status', 'won'),
    supabase.from('leads').select('id,display_name,outlet_city,priority,status,score,primary_phone,next_follow_up_at').eq('owner_id', user.id).eq('priority', 'hot').not('status', 'in', '(won,lost,do_not_contact)').order('score', { ascending: false }).limit(5),
    supabase.from('leads').select('id,display_name,outlet_city,primary_phone,next_follow_up_at,status').eq('owner_id', user.id).lte('next_follow_up_at', new Date(new Date().setHours(23,59,59,999)).toISOString()).gte('next_follow_up_at', new Date(new Date().setHours(0,0,0,0)).toISOString()).order('next_follow_up_at').limit(10),
    supabase.from('import_runs').select('*').eq('owner_id', user.id).order('started_at', { ascending: false }).limit(1),
    supabase.from('territories').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1),
    supabase.from('leads').select('id,display_name,outlet_city,first_sales_date,score').eq('owner_id', user.id).gte('first_sales_date', new Date().toISOString().slice(0,10)).order('first_sales_date').limit(5),
  ])

  const stats = [
    { label: 'Hot Leads', value: hotLeads ?? 0, icon: Flame, href: '/leads?priority=hot', color: 'text-red-500' },
    { label: 'Follow-ups Due', value: followUpsDue ?? 0, icon: Clock, href: '/follow-ups', color: 'text-orange-500' },
    { label: 'Appointments', value: appointments ?? 0, icon: Calendar, href: '/pipeline', color: 'text-purple-500' },
    { label: 'Won Accounts', value: wonAccounts ?? 0, icon: Trophy, href: '/leads?status=won', color: 'text-green-500' },
  ]

  const lastRun = lastImport?.[0]
  const activeTerritory = territory?.[0]

  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          {totalLeads != null && (
            <p className="text-sm text-gray-500 mt-0.5">{totalLeads.toLocaleString()} total leads</p>
          )}
        </div>
        <ImportButton territory={activeTerritory ?? null} lastRun={lastRun ?? null} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(stat => (
          <Link key={stat.label} href={stat.href} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-semibold text-gray-900 mt-0.5">{stat.value}</p>
              </div>
              <stat.icon size={20} className={stat.color} />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Hot Leads */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-900 flex items-center gap-2">
              <Flame size={14} className="text-red-500" /> Top Hot Leads
            </h2>
            <Link href="/leads?priority=hot" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {topHot && topHot.length > 0 ? (
            <ul className="divide-y divide-gray-50">
              {topHot.map(lead => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{lead.display_name || '(Unnamed)'}</p>
                      <p className="text-xs text-gray-500">{lead.outlet_city} · Score {lead.score}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[lead.status as keyof typeof STATUS_COLORS] ?? 'bg-gray-100 text-gray-600'}`}>
                        {lead.status.replace('_', ' ')}
                      </span>
                      <ChevronRight size={14} className="text-gray-400" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No hot leads yet. Import Texas permits to get started.</p>
          )}
        </div>

        {/* Today's Follow-ups */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-900 flex items-center gap-2">
              <Clock size={14} className="text-orange-500" /> Today&apos;s Follow-ups
            </h2>
            <Link href="/follow-ups" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {todayFollowUps && todayFollowUps.length > 0 ? (
            <ul className="divide-y divide-gray-50">
              {todayFollowUps.map(lead => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{lead.display_name || '(Unnamed)'}</p>
                      <p className="text-xs text-gray-500">{lead.primary_phone || lead.outlet_city}</p>
                    </div>
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No follow-ups due today.</p>
          )}
        </div>
      </div>

      {/* Opening Soon */}
      {openingSoon && openingSoon.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-900 flex items-center gap-2">
              <Star size={14} className="text-yellow-500" /> Opening Soon
            </h2>
            <Link href="/leads?openingSoon=true" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <ul className="divide-y divide-gray-50">
            {openingSoon.map(lead => (
              <li key={lead.id}>
                <Link href={`/leads/${lead.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{lead.display_name || '(Unnamed)'}</p>
                    <p className="text-xs text-gray-500">{lead.outlet_city}</p>
                  </div>
                  <span className="text-xs text-green-600 font-medium shrink-0">
                    Opens {fmtDate(lead.first_sales_date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Last Import */}
      {lastRun && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${lastRun.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          {lastRun.status === 'failed'
            ? <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            : <RefreshCw size={16} className="text-gray-500 shrink-0 mt-0.5" />}
          <div className="text-sm">
            <p className="font-medium text-gray-900">Last import — {lastRun.status}</p>
            <p className="text-gray-500 mt-0.5">
              {fmtRelative(lastRun.started_at)} ·{' '}
              Fetched {lastRun.fetched_count} · Inserted {lastRun.inserted_count} · Updated {lastRun.updated_count} · Skipped {lastRun.skipped_count}
            </p>
            {lastRun.error_message && (
              <p className="text-red-600 mt-1">{lastRun.error_message}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
