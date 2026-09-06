/**
 * GET /api/import/enrich/queue?limit=N
 *
 * Returns the next N State leads to enrich, ordered by:
 *   1. Never attempted first (google_enrichment_attempted_at IS NULL)
 *   2. Then oldest attempt (retry-eligible after 30 days)
 *
 * Only returns leads that:
 *   - are from texas_sales_tax_permits
 *   - have no valid phone (permit_phone and primary_phone both empty/null)
 *   - have a non-null business name
 *   - have not been attempted in the last 30 days (or never attempted)
 *
 * The caller (panel or step route) uses this list to drive enrichment.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 10

const RETRY_DAYS = 30

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 100), 200)

  const db      = createServiceClient()
  const cutoff  = new Date(Date.now() - RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Fetch never-attempted leads first, then retry-eligible
  const { data, error } = await db
    .from('leads')
    .select('id, outlet_name, display_name, taxpayer_name, outlet_city, outlet_state, outlet_zip, outlet_address')
    .eq('source', 'texas_sales_tax_permits')
    .eq('lead_source_label', 'state')
    .or(`google_enrichment_attempted_at.is.null,google_enrichment_attempted_at.lt.${cutoff}`)
    .or('permit_phone.is.null,permit_phone.eq.')
    .or('primary_phone.is.null,primary_phone.eq.')
    .not('outlet_name', 'is', null)
    .order('google_enrichment_attempted_at', { ascending: true, nullsFirst: true })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data ?? [], count: data?.length ?? 0 })
}
