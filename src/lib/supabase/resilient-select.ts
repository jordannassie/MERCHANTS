/**
 * PostgREST returns 42703 when a selected column does not exist.
 * Admin pages used to treat that as "row not found" and render a blank 404.
 * These helpers strip the missing column and retry so a valid lead still loads.
 */

export const MISSING_COLUMN_RE =
  /column\s+(?:[\w"]+\.)?["']?(\w+)["']?\s+does not exist/i

export function parseMissingColumn(message: string | undefined | null): string | null {
  if (!message) return null
  const match = message.match(MISSING_COLUMN_RE)
  return match?.[1] ?? null
}

export interface ColumnFallbackResult<T> {
  data: T
  error: string | null
  usedColumns: string[]
  stripped: string[]
}

/**
 * Re-run a Supabase select, removing one missing column per attempt.
 * `run` must use the provided column list in `.select(...)`.
 */
export async function withColumnFallback<T>(
  columns: string[],
  run: (columns: string[]) => Promise<{
    data: T
    error: { message?: string; code?: string } | null
  }>,
): Promise<ColumnFallbackResult<T>> {
  let cols = columns.filter(Boolean)
  const stripped: string[] = []

  for (let attempt = 0; attempt < 40; attempt++) {
    if (cols.length === 0) {
      return {
        data: null as T,
        error: 'No selectable columns remained after stripping missing fields',
        usedColumns: cols,
        stripped,
      }
    }

    const { data, error } = await run(cols)
    if (!error) {
      return { data, error: null, usedColumns: cols, stripped }
    }

    const missing = parseMissingColumn(error.message)
    if (missing) {
      const next = cols.filter(col => col !== missing)
      if (next.length !== cols.length) {
        cols = next
        stripped.push(missing)
        continue
      }
    }

    return {
      data: data as T,
      error: error.message ?? 'Supabase query failed',
      usedColumns: cols,
      stripped,
    }
  }

  return {
    data: null as T,
    error: 'Exceeded column-fallback retries',
    usedColumns: cols,
    stripped,
  }
}

export const LEAD_CORE_COLUMNS = [
  'id',
  'territory_id',
  'source',
  'taxpayer_number',
  'outlet_number',
  'taxpayer_name',
  'taxpayer_address',
  'taxpayer_city',
  'taxpayer_state',
  'taxpayer_zip',
  'taxpayer_county_code',
  'taxpayer_organization_type',
  'outlet_name',
  'outlet_address',
  'outlet_city',
  'outlet_state',
  'outlet_zip',
  'outlet_county_code',
  'naics_code',
  'inside_outside_city',
  'category',
  'permit_issue_date',
  'first_sales_date',
  'first_imported_at',
  'last_seen_at',
  'display_name',
  'score',
  'priority',
  'score_reasons',
  'status',
  'starred',
  'primary_phone',
  'primary_email',
  'website',
  'owner_name',
  'contact_title',
  'google_maps_url',
  'enrichment_status',
  'enriched_at',
  'last_contacted_at',
  'next_follow_up_at',
  'est_monthly_processing',
  'permit_phone',
  'permit_phone_source',
  'permit_phone_imported_at',
  'main_note',
  'main_note_updated_at',
  'created_at',
  'updated_at',
] as const

export const LEAD_OPTIONAL_COLUMNS = [
  'enrichment_error',
  'google_place_id',
  'international_phone',
  'business_status',
  'google_primary_type',
  'contact_match_confidence',
  'contact_source',
  'contact_source_urls',
  'lead_source_label',
  'quo_contact_id',
  'sms_status',
  'sms_last_sent_at',
  'sms_needs_reply',
  'proposal_slug',
  'proposal_savings_monthly',
  'proposal_transaction_rate',
  'proposal_equipment',
  'proposal_contract',
  'proposal_status',
  'proposal_sent_at',
  'proposal_viewed_at',
  'proposal_accepted_at',
  'proposal_contact_name',
  'proposal_contact_email',
  'proposal_contact_phone',
  'followup_step',
  'followup_started_at',
  'followup_completed_at',
  'last_followup_sent_at',
  'proposal_view_count',
  'proposal_last_viewed_at',
  'agreement_requested_at',
  'estimated_monthly_card_sales',
  'proposal_selected_option',
  'proposal_calc_snapshot',
  'opted_out_at',
  'opt_out_reason',
  'opt_out_source',
] as const

export const LEAD_DETAIL_COLUMNS: string[] = [
  ...LEAD_CORE_COLUMNS,
  ...LEAD_OPTIONAL_COLUMNS,
]

export const LEAD_LIST_COLUMNS: string[] = [
  'id',
  'display_name',
  'outlet_name',
  'taxpayer_name',
  'outlet_city',
  'outlet_state',
  'outlet_county_code',
  'primary_phone',
  'permit_phone',
  'status',
  'sms_status',
  'sms_needs_reply',
  'sms_last_sent_at',
  'lead_source_label',
  'proposal_slug',
  'proposal_status',
  'proposal_view_count',
  'proposal_last_viewed_at',
  'followup_step',
  'next_follow_up_at',
  'score',
  'created_at',
  'updated_at',
  'opted_out_at',
  'agreement_requested_at',
  'permit_issue_date',
  'first_sales_date',
  'google_maps_url',
  'starred',
]
