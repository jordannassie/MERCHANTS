import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import type { Lead } from '@/lib/types'
import { PIPELINE_STATUSES } from '@/lib/constants'
import { PipelineBoard } from '@/components/pipeline/PipelineBoard'

export const metadata: Metadata = { title: 'Pipeline — Merchant Radar' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string>>
}

// NULL-safe non-chain filter
const NON_CHAIN = 'category.is.null,category.neq.corporate_chain'

// Mobile shows Lost as well; keep PIPELINE_STATUSES for desktop Kanban grouping
const ALL_STAGES = [...PIPELINE_STATUSES, 'lost'] as const

// Columns with main_note (requires migration 011 — falls back gracefully without it)
const SELECT_FULL =
  'id,display_name,outlet_name,taxpayer_name,outlet_city,priority,status,score,primary_phone,permit_phone,next_follow_up_at,starred,main_note,main_note_updated_at,category'
const SELECT_COMPAT =
  'id,display_name,outlet_name,taxpayer_name,outlet_city,priority,status,score,primary_phone,permit_phone,next_follow_up_at,starred,category'

const DEFAULT_STAGE = 'new'

export default async function PipelinePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const hasPhone = sp.hasPhone !== 'false'
  // Mobile active stage — default to 'new'
  const activeStage = ALL_STAGES.includes(sp.stage as (typeof ALL_STAGES)[number])
    ? sp.stage
    : DEFAULT_STAGE

  const supabase = createServiceClient()

  function makeQuery(selectCols: string, phoneFilter: boolean) {
    let q = supabase
      .from('leads')
      .select(selectCols)
      .in('status', [...ALL_STAGES])
      .or(NON_CHAIN)
      .order('score', { ascending: false })

    if (phoneFilter) {
      q = q.or('permit_phone.not.is.null,primary_phone.not.is.null')
    }

    return q
  }

  const [
    { data: rawLeads, error: leadsError },
    { count: totalCount },
    { count: callableCount },
  ] = await Promise.all([
    makeQuery(SELECT_FULL, hasPhone),

    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .in('status', [...ALL_STAGES])
      .or(NON_CHAIN),

    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .in('status', [...ALL_STAGES])
      .or(NON_CHAIN)
      .or('permit_phone.not.is.null,primary_phone.not.is.null'),
  ])

  let leadsData: Lead[]
  if (leadsError) {
    const { data: fallback } = await makeQuery(SELECT_COMPAT, hasPhone)
    leadsData = (fallback ?? []) as unknown as Lead[]
  } else {
    leadsData = (rawLeads ?? []) as unknown as Lead[]
  }

  // Group by status (includes 'lost' for mobile)
  const byStatus = ([...ALL_STAGES] as string[]).reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s] = leadsData.filter(l => l.status === s)
    return acc
  }, {})

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-gray-900">Pipeline</h1>
        <p className="text-xs text-gray-500 mt-0.5 hidden md:block">
          Tap <strong>Call</strong> to dial, <strong>Note</strong> to open the notepad.
        </p>
      </div>

      <PipelineBoard
        byStatus={byStatus}
        hasPhone={hasPhone}
        activeStage={activeStage}
        totalCount={totalCount ?? 0}
        callableCount={callableCount ?? 0}
      />
    </div>
  )
}
