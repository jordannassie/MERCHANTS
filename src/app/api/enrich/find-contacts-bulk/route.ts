/**
 * POST /api/enrich/find-contacts-bulk
 * Run Google Places matching for up to 25 leads.
 * Only updates migration-005 columns. Rich metadata goes into enrichment_jobs.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { findPlacesContact, type LeadForSearch } from '@/lib/google-places'
import { z } from 'zod'

const MAX_BATCH = 25
const DELAY_MS = 350

const schema = z.union([
  z.object({ mode: z.literal('selected'), leadIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH) }),
  z.object({ mode: z.literal('hot_missing_phone'), confirmed: z.literal(true) }),
])

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY is not configured.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const db = createServiceClient()
  let leadsQuery = db
    .from('leads')
    .select(
      'id,display_name,outlet_name,taxpayer_name,outlet_address,outlet_city,' +
      'outlet_state,outlet_zip,primary_phone,website,enrichment_status'
    )

  if (parsed.data.mode === 'selected') {
    leadsQuery = leadsQuery.in('id', parsed.data.leadIds)
  } else {
    leadsQuery = leadsQuery
      .eq('priority', 'hot')
      .is('primary_phone', null)
      .neq('enrichment_status', 'completed')
      .limit(MAX_BATCH)
  }

  const { data: rawLeads, error } = await leadsQuery
  if (error || !rawLeads?.length) {
    return NextResponse.json({ error: error?.message ?? 'No leads found' }, { status: 400 })
  }

  type LeadRow = LeadForSearch & { enrichment_status: string | null }
  const leads = rawLeads as unknown as LeadRow[]

  const results: Array<{
    leadId: string
    status: string
    phone: string | null
    website: string | null
    confidence: number | null
    error?: string
  }> = []

  for (const lead of leads) {
    if (lead.enrichment_status === 'completed') {
      results.push({ leadId: lead.id, status: 'skipped', phone: lead.primary_phone, website: lead.website, confidence: null })
      continue
    }

    await db.from('leads').update({ enrichment_status: 'running' }).eq('id', lead.id)
    const result = await findPlacesContact(lead as LeadForSearch, apiKey)
    const now = new Date().toISOString()

    if (result.status === 'error') {
      await db.from('leads').update({ enrichment_status: 'failed' }).eq('id', lead.id)
      results.push({ leadId: lead.id, status: 'error', phone: null, website: null, confidence: null, error: result.error })
    } else if (result.status === 'not_found') {
      await db.from('leads').update({ enrichment_status: 'failed' }).eq('id', lead.id)
      results.push({ leadId: lead.id, status: 'not_found', phone: null, website: null, confidence: null })
    } else if (result.status === 'review') {
      await db.from('leads').update({ enrichment_status: 'pending' }).eq('id', lead.id)
      results.push({ leadId: lead.id, status: 'review', phone: null, website: null, confidence: result.best?.confidence ?? null })
    } else if (result.status === 'found' && result.best) {
      const p = result.best
      const updates: Record<string, unknown> = {
        enrichment_status: 'completed',
        enriched_at: now,
      }
      if (!lead.primary_phone && p.nationalPhoneNumber) updates.primary_phone = p.nationalPhoneNumber
      if (!lead.website && p.websiteUri) updates.website = p.websiteUri
      if (p.googleMapsUri) updates.google_maps_url = p.googleMapsUri

      const { error: updateErr } = await db
        .from('leads')
        .update(updates)
        .eq('id', lead.id)

      if (updateErr) console.error('[bulk] update error:', updateErr.message)

      await db.from('enrichment_jobs').insert({
        lead_id: lead.id,
        status: 'completed',
        raw_response: {
          source: 'google_places',
          google_place_id: p.id,
          confidence: p.confidence,
          displayName: p.displayName,
          formattedAddress: p.formattedAddress,
          nationalPhoneNumber: p.nationalPhoneNumber,
          internationalPhoneNumber: p.internationalPhoneNumber,
          websiteUri: p.websiteUri,
          googleMapsUri: p.googleMapsUri,
          businessStatus: p.businessStatus,
          primaryType: p.primaryType,
        },
        proposed_data: p,
        started_at: now,
        completed_at: now,
      })

      results.push({
        leadId: lead.id,
        status: 'found',
        phone: p.nationalPhoneNumber,
        website: p.websiteUri,
        confidence: p.confidence,
      })
    }

    await sleep(DELAY_MS)
  }

  const summary = {
    total: results.length,
    found: results.filter(r => r.status === 'found').length,
    review: results.filter(r => r.status === 'review').length,
    not_found: results.filter(r => r.status === 'not_found').length,
    error: results.filter(r => r.status === 'error').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  }

  return NextResponse.json({ results, summary })
}
