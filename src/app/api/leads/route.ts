/**
 * GET /api/leads?search=name&limit=10&priority=hot
 * Server-side lead search using service-role key.
 * Used internally for testing and batch operations.
 * No authentication required (single-workspace app).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const search = sp.get('search') || ''
  const limit = Math.min(Number(sp.get('limit') || '10'), 50)
  const priority = sp.get('priority') || ''
  const status = sp.get('status') || ''
  const hasPhone = sp.get('hasPhone') === 'true'
  const missingPhone = sp.get('missingPhone') === 'true'

  const db = createServiceClient()
  let q = db
    .from('leads')
    .select(
      'id,display_name,outlet_name,outlet_address,outlet_city,outlet_state,outlet_zip,' +
      'naics_code,category,primary_phone,website,google_maps_url,enrichment_status,' +
      'enriched_at,score,priority,status,starred,first_sales_date,permit_issue_date'
    )

  if (search) {
    const s = `%${search}%`
    q = q.or(
      `display_name.ilike.${s},outlet_name.ilike.${s},taxpayer_name.ilike.${s},` +
      `outlet_city.ilike.${s},outlet_zip.ilike.${s},naics_code.ilike.${s}`
    )
  }
  if (priority) q = q.eq('priority', priority)
  if (status) q = q.eq('status', status)
  if (hasPhone) q = q.not('primary_phone', 'is', null)
  if (missingPhone) q = q.is('primary_phone', null)

  q = q.order('score', { ascending: false }).limit(limit)
  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data ?? [], total: (data ?? []).length })
}
