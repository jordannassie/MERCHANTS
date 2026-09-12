/**
 * GET /api/admin/migration-status
 * Reports which migration columns are present in production.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { probeMigrations } from '@/lib/migrations/pending-apply'

export async function GET() {
  const db = createServiceClient()

  async function colExists(table: string, col: string): Promise<boolean> {
    const { error } = await db.from(table).select(col).limit(0)
    return !error
  }

  const [
    googlePlaceId,
    enrichmentError,
    leadSourceLabel,
    smsStatus,
    optedOutAt,
    followupStep,
    proposalSlug,
    probe,
  ] = await Promise.all([
    colExists('leads', 'google_place_id'),
    colExists('leads', 'enrichment_error'),
    colExists('leads', 'lead_source_label'),
    colExists('leads', 'sms_status'),
    colExists('leads', 'opted_out_at'),
    colExists('leads', 'followup_step'),
    colExists('leads', 'proposal_slug'),
    probeMigrations(db),
  ])

  return NextResponse.json({
    migrations: {
      '007_enrichment_columns': googlePlaceId && enrichmentError,
      '017_google_maps_source': leadSourceLabel,
      '019_sms_integration': smsStatus,
      '022_proposal_fields': proposalSlug,
      '025_sales_followup_system': followupStep,
      '028_dnc_optin': optedOutAt,
    },
    columns: probe.columns,
    applied: probe.applied,
    missing: probe.missing,
    detail_404_cause: !enrichmentError
      ? 'column leads.enrichment_error does not exist'
      : null,
    manual_sql_url: 'https://supabase.com/dashboard/project/phhczohqidgrvcmszets/sql/new',
  })
}
