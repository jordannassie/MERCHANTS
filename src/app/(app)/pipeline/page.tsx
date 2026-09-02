import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import type { Lead } from '@/lib/types'
import { PIPELINE_STATUSES } from '@/lib/constants'
import { PipelineColumn } from '@/components/pipeline/PipelineColumn'
import { PipelineFilterBar } from '@/components/pipeline/PipelineFilterBar'

export const metadata: Metadata = { title: 'Pipeline — Merchant Radar' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string>>
}

// NULL-safe non-chain filter (matches leads/ and dashboard behaviour)
const NON_CHAIN = 'category.is.null,category.neq.corporate_chain'

const COLUMN_LABELS: Record<string, string> = {
  new: 'New',
  attempted: 'Attempted',
  connected: 'Connected',
  follow_up: 'Follow-up',
  appointment: 'Appointment',
  won: 'Won',
}

// Columns with main_note (requires migration 011). Will fall back to without it.
const SELECT_FULL =
  'id,display_name,outlet_name,taxpayer_name,outlet_city,priority,status,score,primary_phone,permit_phone,next_follow_up_at,starred,main_note,main_note_updated_at,category'
const SELECT_COMPAT =
  'id,display_name,outlet_name,taxpayer_name,outlet_city,priority,status,score,primary_phone,permit_phone,next_follow_up_at,starred,category'

export default async function PipelinePage({ searchParams }: PageProps) {
  const sp = await searchParams
  // Default: show only callable leads — same as /leads default
  const hasPhone = sp.hasPhone !== 'false'

  const supabase = createServiceClient()

  // Build the query factory to avoid duplicating filter logic
  function makeQuery(selectCols: string, phoneFilter: boolean) {
    let q = supabase
      .from('leads')
      .select(selectCols)
      .in('status', [...PIPELINE_STATUSES])
      .or(NON_CHAIN)
      .order('score', { ascending: false })

    if (phoneFilter) {
      q = q.or('permit_phone.not.is.null,primary_phone.not.is.null')
    }

    return q
  }

  // Run all three queries concurrently
  const [
    { data: rawLeads, error: leadsError },
    { count: totalCount },
    { count: callableCount },
  ] = await Promise.all([
    makeQuery(SELECT_FULL, hasPhone),

    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .in('status', [...PIPELINE_STATUSES])
      .or(NON_CHAIN),

    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .in('status', [...PIPELINE_STATUSES])
      .or(NON_CHAIN)
      .or('permit_phone.not.is.null,primary_phone.not.is.null'),
  ])

  let leadsData: Lead[]
  if (leadsError) {
    // Graceful fallback: migration 011 not applied yet — omit main_note columns
    const { data: fallback } = await makeQuery(SELECT_COMPAT, hasPhone)
    leadsData = (fallback ?? []) as unknown as Lead[]
  } else {
    leadsData = (rawLeads ?? []) as unknown as Lead[]
  }

  // Group by status — counts reflect the current filter
  const byStatus = PIPELINE_STATUSES.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s] = leadsData.filter(l => l.status === s)
    return acc
  }, {} as Record<string, Lead[]>)

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-gray-900">Pipeline</h1>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Your sales funnel — tap <strong>Call</strong> to dial, <strong>Note</strong> to open the
        notepad.
      </p>

      <PipelineFilterBar
        hasPhone={hasPhone}
        totalCount={totalCount ?? 0}
        callableCount={callableCount ?? 0}
      />

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
