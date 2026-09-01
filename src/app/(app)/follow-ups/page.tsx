import { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceOwnerId } from '@/lib/workspace'
import type { Lead } from '@/lib/types'
import { fmtDateTime, fmtPhone, STATUS_COLORS, PRIORITY_COLORS } from '@/lib/utils'
import { Phone, ChevronRight, AlertCircle, Clock, Calendar, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = { title: 'Follow-ups — Merchant Radar' }
export const dynamic = 'force-dynamic'

type Section = 'overdue' | 'today' | 'tomorrow' | 'next7' | 'later'

export default async function FollowUpsPage() {
  const supabase = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()
  
  

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
  const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999)
  const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate()+1)
  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate()+1)
  const next7End = new Date(todayEnd); next7End.setDate(next7End.getDate()+7)

  const { data: leads } = await supabase
    .from('leads')
    .select('id,display_name,outlet_name,outlet_city,primary_phone,status,priority,next_follow_up_at,last_contacted_at')
    .eq('owner_id', ownerId)
    .not('next_follow_up_at', 'is', null)
    .not('status', 'in', '(won,lost,do_not_contact)')
    .order('next_follow_up_at')

  const all = (leads ?? []) as Lead[]

  const sections: { id: Section; label: string; icon: React.ElementType; color: string; items: Lead[] }[] = [
    {
      id: 'overdue', label: 'Overdue', icon: AlertCircle, color: 'text-red-500',
      items: all.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) < todayStart),
    },
    {
      id: 'today', label: 'Due Today', icon: Clock, color: 'text-orange-500',
      items: all.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) >= todayStart && new Date(l.next_follow_up_at) <= todayEnd),
    },
    {
      id: 'tomorrow', label: 'Tomorrow', icon: Calendar, color: 'text-blue-500',
      items: all.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) >= tomorrowStart && new Date(l.next_follow_up_at) <= tomorrowEnd),
    },
    {
      id: 'next7', label: 'Next 7 Days', icon: Calendar, color: 'text-gray-500',
      items: all.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) > tomorrowEnd && new Date(l.next_follow_up_at) <= next7End),
    },
    {
      id: 'later', label: 'Later', icon: Clock, color: 'text-gray-400',
      items: all.filter(l => l.next_follow_up_at && new Date(l.next_follow_up_at) > next7End),
    },
  ]

  const totalDue = sections[0].items.length + sections[1].items.length

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Follow-ups</h1>
        {totalDue > 0 && <p className="text-sm text-orange-600 mt-0.5">{totalDue} overdue or due today</p>}
      </div>

      {all.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <CheckCircle2 size={32} className="text-green-500 mx-auto mb-3" />
          <p className="font-medium text-gray-900">All caught up!</p>
          <p className="text-sm text-gray-500 mt-1">No follow-ups scheduled.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(section => section.items.length > 0 && (
            <div key={section.id}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <section.icon size={14} className={section.color} />
                {section.label}
                <span className="text-gray-400 font-normal">({section.items.length})</span>
              </h2>
              <div className="space-y-2">
                {section.items.map(lead => (
                  <div key={lead.id} className={`bg-white rounded-xl border p-4 ${section.id === 'overdue' ? 'border-red-200' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-gray-900 hover:text-blue-600 truncate block">
                          {lead.display_name || lead.outlet_name || '(Unnamed)'}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">{lead.outlet_city}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>{lead.status.replace('_', ' ')}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[lead.priority]}`}>{lead.priority}</span>
                          {lead.next_follow_up_at && (
                            <span className={`text-xs ${section.id === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {fmtDateTime(lead.next_follow_up_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {lead.primary_phone && (
                          <a href={`tel:${lead.primary_phone}`}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                            <Phone size={12} /> Call
                          </a>
                        )}
                        <Link href={`/leads/${lead.id}`}
                          className="flex items-center gap-1 px-3 py-2 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50">
                          Open <ChevronRight size={12} />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
