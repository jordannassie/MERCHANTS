import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import type { Lead, Contact, Activity, EntityRecord } from '@/lib/types'
import { LeadDetailClient } from '@/components/leads/LeadDetailClient'

interface PageProps { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createServiceClient()

  // Explicit column list — excludes raw_record (large TABC JSON blob)
  const LEAD_DETAIL_SELECT =
    'id,territory_id,source,taxpayer_number,outlet_number,taxpayer_name,' +
    'taxpayer_address,taxpayer_city,taxpayer_state,taxpayer_zip,taxpayer_county_code,taxpayer_organization_type,' +
    'outlet_name,outlet_address,outlet_city,outlet_state,outlet_zip,outlet_county_code,' +
    'naics_code,inside_outside_city,category,' +
    'permit_issue_date,first_sales_date,first_imported_at,last_seen_at,' +
    'display_name,score,priority,score_reasons,status,starred,' +
    'primary_phone,primary_email,website,owner_name,contact_title,' +
    'google_maps_url,enrichment_status,enriched_at,enrichment_error,' +
    'last_contacted_at,next_follow_up_at,est_monthly_processing,' +
    'google_place_id,international_phone,business_status,google_primary_type,' +
    'contact_match_confidence,contact_source,contact_source_urls,' +
    'permit_phone,permit_phone_source,permit_phone_imported_at,' +
    'main_note,main_note_updated_at,lead_source_label,' +
    'quo_contact_id,sms_status,sms_last_sent_at,sms_needs_reply,' +
    'proposal_slug,proposal_savings_monthly,proposal_transaction_rate,' +
    'proposal_equipment,proposal_contract,proposal_status,proposal_sent_at,' +
    'proposal_viewed_at,proposal_accepted_at,proposal_contact_name,' +
    'proposal_contact_email,proposal_contact_phone,' +
    'followup_step,followup_started_at,followup_completed_at,last_followup_sent_at,' +
    'proposal_view_count,proposal_last_viewed_at,agreement_requested_at,' +
    'estimated_monthly_card_sales,proposal_selected_option,proposal_calc_snapshot,' +
    'opted_out_at,opt_out_reason,opt_out_source,created_at,updated_at'

  const [
    { data: lead },
    { data: contacts },
    { data: activities },
    { data: enrichmentJobs },
    entityResult,
  ] = await Promise.all([
    supabase.from('leads').select(LEAD_DETAIL_SELECT).eq('id', id).single(),
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
      lead={lead as unknown as Lead}
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
