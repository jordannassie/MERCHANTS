export type LeadStatus =
  | 'new'
  | 'attempted'
  | 'connected'
  | 'follow_up'
  | 'appointment'
  | 'won'
  | 'lost'
  | 'do_not_contact'

export type LeadPriority = 'hot' | 'good' | 'low' | 'skip'
export type ActivityType = 'call' | 'note' | 'email' | 'meeting' | 'status_change'
export type CallOutcome =
  | 'no_answer'
  | 'voicemail'
  | 'connected'
  | 'call_back'
  | 'not_interested'
  | 'appointment'
  | 'won'

export interface Profile {
  id: string
  full_name: string | null
  created_at: string
  updated_at: string
}

export interface Territory {
  id: string
  owner_id: string
  name: string
  county_codes: string[]
  days_to_import: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  owner_id: string
  territory_id: string | null
  source: string
  taxpayer_number: string
  outlet_number: string
  taxpayer_name: string | null
  taxpayer_address: string | null
  taxpayer_city: string | null
  taxpayer_state: string | null
  taxpayer_zip: string | null
  taxpayer_county_code: string | null
  taxpayer_organization_type: string | null
  outlet_name: string | null
  outlet_address: string | null
  outlet_city: string | null
  outlet_state: string | null
  outlet_zip: string | null
  outlet_county_code: string | null
  naics_code: string | null
  inside_outside_city: string | null
  permit_issue_date: string | null
  first_sales_date: string | null
  raw_record: Record<string, unknown> | null
  first_imported_at: string
  last_seen_at: string
  display_name: string | null
  category: string | null
  score: number
  priority: LeadPriority
  score_reasons: string[] | null
  status: LeadStatus
  starred: boolean
  primary_phone: string | null
  primary_email: string | null
  website: string | null
  owner_name: string | null
  contact_title: string | null
  google_maps_url: string | null
  enrichment_status: 'pending' | 'running' | 'completed' | 'failed' | null
  enriched_at: string | null
  last_contacted_at: string | null
  next_follow_up_at: string | null
  est_monthly_processing: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  owner_id: string
  lead_id: string
  full_name: string
  title: string | null
  business_phone: string | null
  mobile_phone: string | null
  email: string | null
  contact_type: 'owner' | 'manager' | 'decision_maker' | 'other' | null
  source_url: string | null
  is_primary: boolean
  source_type: 'manual' | 'enriched'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  owner_id: string
  lead_id: string
  contact_id: string | null
  activity_type: ActivityType
  call_outcome: CallOutcome | null
  notes: string | null
  duration_seconds: number | null
  occurred_at: string
  next_follow_up_at: string | null
  created_at: string
}

export interface ImportRun {
  id: string
  owner_id: string
  territory_id: string | null
  source: string
  status: 'running' | 'completed' | 'partial' | 'failed'
  requested_start_date: string | null
  county_codes: string[] | null
  fetched_count: number
  inserted_count: number
  updated_count: number
  duplicate_count: number
  skipped_count: number
  error_message: string | null
  started_at: string
  completed_at: string | null
}

export interface EnrichmentJob {
  id: string
  owner_id: string
  lead_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  ai_score_adjustment: number | null
  ai_score_reason: string | null
  raw_response: Record<string, unknown> | null
  proposed_data: Record<string, unknown> | null
  accepted_fields: string[] | null
  sources: Array<{ url: string; title: string; fields: string[] }> | null
  input_tokens: number | null
  output_tokens: number | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ─── Filter/query parameter types ────────────────────────────────────────────

export interface LeadsFilters {
  search?: string
  status?: LeadStatus | ''
  priority?: LeadPriority | ''
  county?: string
  city?: string
  permitDateFrom?: string
  permitDateTo?: string
  firstSalesDateFrom?: string
  firstSalesDateTo?: string
  openingSoon?: boolean
  neverContacted?: boolean
  followUpDue?: boolean
  starred?: boolean
  sort?: LeadSortField
  order?: 'asc' | 'desc'
  page?: number
}

export type LeadSortField = 'score' | 'permit_issue_date' | 'first_sales_date' | 'next_follow_up_at' | 'created_at'

export const LEADS_PER_PAGE = 25
