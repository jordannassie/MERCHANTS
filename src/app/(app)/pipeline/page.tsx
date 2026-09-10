import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import type { Lead } from '@/lib/types'
import { PipelineBoard } from '@/components/pipeline/PipelineBoard'

export const metadata: Metadata = { title: 'Pipeline — Merchant Radar' }
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string>>
}

// NULL-safe non-chain filter
const NON_CHAIN = 'category.is.null,category.neq.corporate_chain'

// Active pipeline stages (kanban columns) — includes 'appointment' for legacy leads
const ACTIVE_STAGES = ['attempted', 'connected', 'agreement_requested', 'appointment', 'won'] as const
// Closed stages for closed view
const CLOSED_STAGES = ['lost', 'do_not_contact'] as const

// Stages known-safe for DB constraint (fallback if agreement_requested/appointment causes error)
const SAFE_STAGES = ['attempted', 'connected', 'appointment', 'won', 'lost', 'do_not_contact'] as const

const ALL_STAGES = [...ACTIVE_STAGES, ...CLOSED_STAGES] as const

// Full select — includes migration 025 columns
const SELECT_FULL =
  'id,display_name,outlet_name,taxpayer_name,outlet_city,priority,status,score,primary_phone,permit_phone,' +
  'next_follow_up_at,starred,main_note,main_note_updated_at,category,' +
  'proposal_status,proposal_view_count,sms_needs_reply,followup_step,agreement_requested_at'

// Compat select — only pre-025 columns, guaranteed to exist in production
const SELECT_COMPAT =
  'id,display_name,outlet_name,taxpayer_name,outlet_city,priority,status,score,primary_phone,permit_phone,' +
  'next_follow_up_at,starred,category,proposal_status'

// Minimal safe select — absolute last resort
const SAFE_SELECT =
  'id,display_name,outlet_name,taxpayer_name,outlet_city,status,primary_phone,permit_phone,' +
  'next_follow_up_at,category,proposal_status'

const DEFAULT_STAGE = 'attempted'

export default async function PipelinePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const hasPhone = sp.hasPhone !== 'false'

  // Mobile active stage — default to 'attempted'
  const activeStage = ALL_STAGES.includes(sp.stage as (typeof ALL_STAGES)[number])
    ? sp.stage
    : DEFAULT_STAGE

  const supabase = createServiceClient()

  function makeQuery(selectCols: string, phoneFilter: boolean, stages: readonly string[]) {
    let q = supabase
      .from('leads')
      .select(selectCols)
      .in('status', [...stages])
      .or(NON_CHAIN)
      .order('score', { ascending: false })
      .limit(200)

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
    makeQuery(SELECT_FULL, hasPhone, ALL_STAGES),

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
  if (!leadsError && rawLeads) {
    leadsData = rawLeads as unknown as Lead[]
  } else {
    // First fallback: pre-025 columns with same stages
    const { data: compat, error: compatError } = await makeQuery(SELECT_COMPAT, hasPhone, ALL_STAGES)
    if (!compatError && compat) {
      leadsData = compat as unknown as Lead[]
    } else {
      // Second fallback: minimal columns + SAFE_STAGES only
      const { data: safe } = await makeQuery(SAFE_SELECT, hasPhone, SAFE_STAGES)
      leadsData = (safe ?? []) as unknown as Lead[]
    }
  }

  // Group by status — include all possible stages (ACTIVE + CLOSED)
  const ALL_GROUPING_STAGES = [...new Set([...ALL_STAGES, ...SAFE_STAGES])] as string[]
  const byStatus = ALL_GROUPING_STAGES.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s] = leadsData.filter(l => l.status === s)
    return acc
  }, {})

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-gray-900">Pipeline</h1>
        <p className="text-xs text-gray-500 mt-0.5 hidden md:block">
          Tap <strong>Call</strong> to dial · <strong>Open</strong> to view details.
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
