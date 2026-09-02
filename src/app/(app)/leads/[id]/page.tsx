import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import type { Lead, Contact, Activity, EntityRecord } from '@/lib/types'
import { LeadDetailClient } from '@/components/leads/LeadDetailClient'

interface PageProps { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    { data: lead },
    { data: contacts },
    { data: activities },
    { data: enrichmentJobs },
    entityResult,
  ] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
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
    // entity_records added by migration 008 — gracefully handle missing table
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
  ])

  if (!lead) notFound()

  // Extract Google Places data from the most recent completed enrichment job
  const placeCache = enrichmentJobs?.[0]?.raw_response?.source === 'google_places'
    ? (enrichmentJobs[0].raw_response as Record<string, unknown>)
    : null

  const entityRecord = (entityResult as { data: EntityRecord | null }).data ?? null

  return (
    <LeadDetailClient
      lead={lead as Lead}
      contacts={(contacts ?? []) as Contact[]}
      activities={
        (activities ?? []) as (Activity & {
          contact?: { full_name: string } | null
        })[]
      }
      placeCache={placeCache}
      entityRecord={entityRecord}
    />
  )
}
