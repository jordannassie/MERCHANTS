import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import type { Lead } from '@/lib/types'
import { PIPELINE_STATUSES } from '@/lib/constants'
import { PipelineColumn } from '@/components/pipeline/PipelineColumn'

export const metadata: Metadata = { title: 'Pipeline — Merchant Radar' }
export const dynamic = 'force-dynamic'

const COLUMN_LABELS: Record<string, string> = {
  new: 'New', attempted: 'Attempted', connected: 'Connected',
  follow_up: 'Follow-up', appointment: 'Appointment', won: 'Won',
}

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: leads } = await supabase
    .from('leads')
    .select('id,display_name,outlet_name,taxpayer_name,outlet_city,priority,status,score,primary_phone,next_follow_up_at,starred')
    .eq('owner_id', user.id)
    .in('status', [...PIPELINE_STATUSES])
    .order('score', { ascending: false })

  const byStatus = PIPELINE_STATUSES.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s] = (leads ?? []).filter(l => l.status === s) as Lead[]
    return acc
  }, {} as Record<string, Lead[]>)

  return (
    <div className="px-4 md:px-8 py-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Pipeline</h1>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STATUSES.map(status => (
          <PipelineColumn
            key={status}
            status={status}
            label={COLUMN_LABELS[status]}
            leads={byStatus[status]}
          />
        ))}
      </div>
    </div>
  )
}
