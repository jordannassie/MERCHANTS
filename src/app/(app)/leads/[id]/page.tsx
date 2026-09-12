import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import type { Lead, Contact, Activity, EntityRecord } from '@/lib/types'
import { LeadDetailClient } from '@/components/leads/LeadDetailClient'
import {
  LEAD_DETAIL_COLUMNS,
  withColumnFallback,
} from '@/lib/supabase/resilient-select'

interface PageProps { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    leadResult,
    { data: contacts },
    { data: activities },
    { data: enrichmentJobs },
    entityResult,
    smsResult,
  ] = await Promise.all([
    withColumnFallback(LEAD_DETAIL_COLUMNS, async columns => {
      const { data, error } = await supabase
        .from('leads')
        .select(columns.join(','))
        .eq('id', id)
        .maybeSingle()
      return { data, error }
    }),
    supabase
      .from('contacts')
      .select('*')
      .eq('lead_id', id)
      .order('is_primary', { ascending: false })
      .order('created_at'),
    supabase
      .from('activities')
      .select('*, contact:contacts(full_name)')
      .eq('lead_id', id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase
      .from('enrichment_jobs')
      .select('raw_response,status,completed_at')
      .eq('lead_id', id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1),
    (async () => {
      try {
        return await supabase
          .from('entity_records')
          .select('*')
          .eq('lead_id', id)
          .order('researched_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      } catch {
        return { data: null, error: null }
      }
    })(),
    (async () => {
      const { data, error } = await supabase
        .from('sms_messages')
        .select('id,direction,to_number,from_number,content,status,sent_at,delivered_at,error_message,quo_message_id')
        .eq('lead_id', id)
        .order('sent_at', { ascending: false })
        .limit(50)
      if (error) {
        console.error('[lead-detail] sms_messages query failed:', error.message)
        return []
      }
      return data ?? []
    })(),
  ])

  if (leadResult.error) {
    console.error('[lead-detail] Supabase error for', id, {
      error: leadResult.error,
      stripped: leadResult.stripped,
    })
    return (
      <LeadQueryError
        title="Lead details could not load"
        message={leadResult.error}
        stripped={leadResult.stripped}
        leadId={id}
      />
    )
  }

  if (!leadResult.data) {
    return (
      <LeadQueryError
        title="Lead not found"
        message={`No lead exists with id ${id}.`}
        stripped={leadResult.stripped}
        leadId={id}
        notFound
      />
    )
  }

  if (leadResult.stripped.length > 0) {
    console.warn('[lead-detail] Loaded with missing columns stripped:', leadResult.stripped)
  }

  const placeCache = enrichmentJobs?.[0]?.raw_response?.source === 'google_places'
    ? (enrichmentJobs[0].raw_response as Record<string, unknown>)
    : null

  const entityRecord = (entityResult as { data: EntityRecord | null }).data ?? null

  return (
    <LeadDetailClient
      lead={leadResult.data as unknown as Lead}
      contacts={(contacts ?? []) as Contact[]}
      activities={
        (activities ?? []) as (Activity & {
          contact?: { full_name: string } | null
        })[]
      }
      placeCache={placeCache}
      entityRecord={entityRecord}
      smsMessages={smsResult}
    />
  )
}

function LeadQueryError({
  title,
  message,
  stripped,
  leadId,
  notFound,
}: {
  title: string
  message: string
  stripped: string[]
  leadId: string
  notFound?: boolean
}) {
  return (
    <div className="max-w-xl mx-auto px-4 md:px-8 py-16">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {!notFound && (
          <p className="text-sm text-gray-600">
            The database query failed. This is usually a missing column or
            unapplied migration — not a deleted lead.
          </p>
        )}
        <p className="text-sm font-mono bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-gray-700 break-words">
          {message}
        </p>
        {stripped.length > 0 && (
          <p className="text-xs text-gray-500">
            Stripped missing columns: {stripped.join(', ')}
          </p>
        )}
        <p className="text-xs text-gray-400">Lead ID: {leadId}</p>
        <Link
          href="/leads?status=all"
          className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          ← Back to Leads
        </Link>
      </div>
    </div>
  )
}
