import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { toCSV } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const db = createServiceClient()
  const sp = request.nextUrl.searchParams

  // NULL-safe non-chain filter — neq silently excludes NULL rows in PostgreSQL
  const NON_CHAIN = 'category.is.null,category.neq.corporate_chain'
  const showChains = sp.get('showChains') === 'true'

  let query = db
    .from('leads')
    .select(
      'display_name,outlet_city,outlet_county_code,outlet_address,outlet_zip,' +
      'naics_code,category,primary_phone,permit_phone,primary_email,website,owner_name,' +
      'status,priority,score,permit_issue_date,first_sales_date,' +
      'last_contacted_at,next_follow_up_at,taxpayer_number,outlet_number,' +
      'lead_source_label,google_place_id,google_maps_url,first_imported_at'
    )

  if (!showChains) query = query.or(NON_CHAIN)

  const search = sp.get('search')
  if (search) {
    const s = `%${search}%`
    query = query.or(
      `display_name.ilike.${s},outlet_name.ilike.${s},primary_phone.ilike.${s},outlet_city.ilike.${s}`
    )
  }
  const status = sp.get('status')
  if (status) query = query.eq('status', status)
  const priority = sp.get('priority')
  if (priority) query = query.eq('priority', priority)
  const county = sp.get('county')
  if (county) query = query.eq('outlet_county_code', county)
  const permitFrom = sp.get('permitDateFrom')
  if (permitFrom) query = query.gte('permit_issue_date', permitFrom)
  const permitTo = sp.get('permitDateTo')
  if (permitTo) query = query.lte('permit_issue_date', permitTo)
  if (sp.get('openingSoon') === 'true') {
    query = query.gte('first_sales_date', new Date().toISOString().slice(0, 10))
  }
  if (sp.get('starred') === 'true') query = query.eq('starred', true)

  query = query.order('score', { ascending: false }).limit(5000)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const csv = toCSV((data ?? []) as unknown as Record<string, unknown>[])
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="merchant-radar-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
