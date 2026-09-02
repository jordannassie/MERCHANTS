/**
 * POST /api/enrich/lookup-entity
 *
 * Look up Texas Comptroller entity data for a lead using the free CPA API.
 * Stores results in the entity_records table.
 *
 * Requires:
 *   - CPA_API_KEY env var (free registration at comptroller.texas.gov)
 *
 * Body: { leadId: string, force?: boolean }
 *
 * Sources used:
 *   - CPA sales-tax-payer endpoint (sole proprietor name)
 *   - CPA franchise-tax endpoint (officers, SOS file number, registered agent)
 *
 * Rules enforced:
 *   - Organizer ≠ owner (confidence capped at 40)
 *   - Registered agent ≠ owner (excluded if commercial RA)
 *   - Every person shown with their exact official title and source
 *   - No phone inferred from any entity record
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  fetchSalesTaxPayer,
  fetchFranchiseTax,
  extractDecisionMaker,
  isCommercialAgent,
} from '@/lib/cpa-api'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limit: entity lookups use CPA API (free but polite)
  const db = createServiceClient()
  const rateCheck = await checkRateLimit(db, 'research')
  if (rateLimitExceeded(rateCheck)) {
    return NextResponse.json(
      { error: 'Rate limit reached. Try again later.', limit: rateCheck },
      { status: 429 }
    )
  }

  if (!process.env.CPA_API_KEY) {
    return NextResponse.json(
      {
        error: 'CPA_API_KEY is not configured.',
        instructions: 'Register for a free CPA API key at https://comptroller.texas.gov/transparency/open-data/ then add CPA_API_KEY to your Netlify environment variables.',
      },
      { status: 503 }
    )
  }

  let body: { leadId?: string; force?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { leadId, force = false } = body
  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
  }

  // Fetch lead
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .select('id, taxpayer_number, outlet_number, display_name, outlet_name, taxpayer_name, outlet_city, outlet_state')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  if (!lead.taxpayer_number) {
    return NextResponse.json({ error: 'Lead has no taxpayer_number — entity lookup not available' }, { status: 422 })
  }

  // Check for existing entity record (skip if not forced)
  if (!force) {
    const { data: existing } = await db
      .from('entity_records')
      .select('id, researched_at, primary_contact_name')
      .eq('lead_id', leadId)
      .order('researched_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.researched_at) {
      return NextResponse.json({ cached: true, entity: existing })
    }
  }

  const taxpayerId = lead.taxpayer_number.padStart(11, '0')

  // Parallel CPA API calls
  const [salesTaxPayer, franchiseTax] = await Promise.all([
    fetchSalesTaxPayer(taxpayerId),
    fetchFranchiseTax(taxpayerId),
  ])

  const decisionMaker = extractDecisionMaker(franchiseTax, salesTaxPayer)

  const raName = franchiseTax?.registeredAgentName ?? null
  const raIsCommercial = isCommercialAgent(raName)

  const entityRecord = {
    lead_id: leadId,
    taxpayer_id: taxpayerId,
    legal_entity_name: franchiseTax?.name ?? salesTaxPayer?.BUSINESS_NAME ?? null,
    dba_name: franchiseTax?.dbaName ?? null,
    state_of_formation: franchiseTax?.stateOfFormation ?? null,
    sos_file_number: franchiseTax?.sosFileNumber ?? null,
    sos_registration_status: franchiseTax?.sosRegistrationStatus ?? null,
    registered_agent_name: raName,
    registered_office_street: franchiseTax?.registeredOfficeAddressStreet ?? null,
    registered_office_city: franchiseTax?.registeredOfficeAddressCity ?? null,
    registered_office_state: franchiseTax?.registeredOfficeAddressState ?? null,
    registered_office_zip: franchiseTax?.registeredOfficeAddressZip ?? null,
    officers: franchiseTax?.officerInfo ?? null,
    individual_first_name: salesTaxPayer?.FIRST_NAME ?? null,
    individual_last_name: salesTaxPayer?.LAST_NAME ?? null,
    individual_full_name: salesTaxPayer?.FIRST_NAME
      ? [salesTaxPayer.FIRST_NAME, salesTaxPayer.MIDDLE_NAME, salesTaxPayer.LAST_NAME].filter(Boolean).join(' ')
      : null,
    primary_contact_name: decisionMaker?.name ?? null,
    primary_contact_title: decisionMaker?.title ?? null,
    primary_contact_role: decisionMaker?.role ?? null,
    entity_source_url: `https://mycpa.cpa.state.tx.us/coa/cosSearch.do`,
    entity_confidence: decisionMaker?.confidence ?? 0,
    registered_agent_is_commercial: raIsCommercial,
    researched_at: new Date().toISOString(),
  }

  // Upsert — one entity record per lead
  const { data: saved, error: saveErr } = await db
    .from('entity_records')
    .upsert(entityRecord, { onConflict: 'lead_id' })
    .select()
    .single()

  if (saveErr) {
    // If entity_records table doesn't exist yet (migration 008 not applied)
    if (saveErr.code === '42P01') {
      return NextResponse.json(
        {
          error: 'entity_records table not found. Apply migration 008 first.',
          entityData: entityRecord,
          decisionMaker,
        },
        { status: 503 }
      )
    }
    console.error('[lookup-entity] save error:', saveErr)
    return NextResponse.json({ error: 'Failed to save entity record', detail: saveErr.message }, { status: 500 })
  }

  return NextResponse.json({
    entity: saved,
    decisionMaker,
    salesTaxPayer: salesTaxPayer
      ? {
          individualName: salesTaxPayer.FIRST_NAME
            ? [salesTaxPayer.FIRST_NAME, salesTaxPayer.LAST_NAME].filter(Boolean).join(' ')
            : null,
          businessName: salesTaxPayer.BUSINESS_NAME,
          status: salesTaxPayer.STATUS,
        }
      : null,
    franchiseTax: franchiseTax
      ? {
          name: franchiseTax.name,
          sosFileNumber: franchiseTax.sosFileNumber,
          sosStatus: franchiseTax.sosRegistrationStatus,
          registeredAgent: franchiseTax.registeredAgentName,
          registeredAgentIsCommercial: raIsCommercial,
          officerCount: franchiseTax.officerInfo?.length ?? 0,
          reportYear: franchiseTax.reportYear,
        }
      : null,
  })
}
