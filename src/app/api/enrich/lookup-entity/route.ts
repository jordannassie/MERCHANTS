/**
 * POST /api/enrich/lookup-entity
 *
 * Look up Texas Comptroller entity data for a lead using the free CPA API.
 * Stores results in entity_records (migration 008 required).
 *
 * Error codes returned in response body:
 *   cpa_key_missing   — CPA_API_KEY not set in environment
 *   migration_missing — entity_records table not yet created
 *   internal_rate_limit — our own limiter triggered
 *   entity_not_found  — taxpayer ID not found in CPA records
 *   cpa_error         — CPA API returned an unexpected error
 *
 * CPA API key: free registration at
 *   https://comptroller.texas.gov/transparency/open-data/
 * Set as CPA_API_KEY in Netlify environment variables (never NEXT_PUBLIC_*).
 *
 * Caching: entity_records acts as a cache keyed by taxpayer_id.
 * Repeat visits return the stored record without a new API call.
 * Use force=true to refresh.
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
  const db = createServiceClient()

  // ── 1. Configuration check FIRST (no rate-limit cost for missing key) ──────
  if (!process.env.CPA_API_KEY) {
    return NextResponse.json(
      {
        errorCode: 'cpa_key_missing',
        error: 'CPA_API_KEY is not configured.',
        instructions: [
          'Register for a free CPA API key at https://comptroller.texas.gov/transparency/open-data/',
          'Then add CPA_API_KEY to your Netlify site environment variables (never use NEXT_PUBLIC_).',
          'Redeploy after adding the key.',
        ],
      },
      { status: 503 }
    )
  }

  // ── 2. Rate limit (after config check so missing key doesn't consume quota) ─
  const rateCheck = await checkRateLimit(db, 'entity')
  if (!rateCheck.allowed) return rateLimitExceeded(rateCheck)

  // ── 3. Parse body ────────────────────────────────────────────────────────────
  let body: { leadId?: string; force?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ errorCode: 'bad_request', error: 'Invalid JSON body' }, { status: 400 })
  }

  const { leadId, force = false } = body
  if (!leadId) {
    return NextResponse.json({ errorCode: 'bad_request', error: 'leadId is required' }, { status: 400 })
  }

  // ── 4. Fetch lead ────────────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .select('id, taxpayer_number, outlet_number, display_name, outlet_name, taxpayer_name, outlet_city, outlet_state')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ errorCode: 'not_found', error: 'Lead not found' }, { status: 404 })
  }

  if (!lead.taxpayer_number) {
    return NextResponse.json(
      { errorCode: 'entity_not_found', error: 'Lead has no taxpayer_number — entity lookup not available.' },
      { status: 422 }
    )
  }

  const taxpayerId = lead.taxpayer_number.replace(/\D/g, '').padStart(11, '0')

  // ── 5. Cache hit: return existing entity_record if not forcing ───────────────
  if (!force) {
    try {
      const { data: cached } = await db
        .from('entity_records')
        .select('*')
        .eq('lead_id', leadId)
        .order('researched_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cached?.researched_at) {
        return NextResponse.json({ cached: true, entity: cached })
      }
    } catch (e) {
      // If entity_records doesn't exist yet, fall through to migration check below
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('42P01') || msg.includes('entity_records')) {
        return NextResponse.json(
          {
            errorCode: 'migration_missing',
            error: 'entity_records table not found. Apply migration 008 first.',
            instructions: 'Open supabase/migrations/008_permit_phone_and_entity.sql and run it in the Supabase SQL Editor.',
          },
          { status: 503 }
        )
      }
    }
  }

  // ── 6. Call CPA API (parallel requests) ─────────────────────────────────────
  let salesTaxPayer, franchiseTax
  try {
    ;[salesTaxPayer, franchiseTax] = await Promise.all([
      fetchSalesTaxPayer(taxpayerId),
      fetchFranchiseTax(taxpayerId),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('CPA_API_KEY')) {
      return NextResponse.json({ errorCode: 'cpa_key_missing', error: msg }, { status: 503 })
    }
    return NextResponse.json({ errorCode: 'cpa_error', error: msg }, { status: 502 })
  }

  // ── 7. Parse results ─────────────────────────────────────────────────────────
  if (!salesTaxPayer && !franchiseTax) {
    // Record the fact that we looked and found nothing (so repeat visits are cheap)
    try {
      await db.from('entity_records').upsert(
        {
          lead_id: leadId,
          taxpayer_id: taxpayerId,
          entity_confidence: 0,
          researched_at: new Date().toISOString(),
        },
        { onConflict: 'lead_id' }
      )
    } catch { /* best-effort */ }

    return NextResponse.json(
      { errorCode: 'entity_not_found', error: 'Taxpayer ID not found in Texas Comptroller records.', entity: null },
      { status: 200 } // 200 — not a server error, just no record
    )
  }

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
    entity_source_url: 'https://mycpa.cpa.state.tx.us/coa/cosSearch.do',
    entity_confidence: decisionMaker?.confidence ?? 0,
    registered_agent_is_commercial: raIsCommercial,
    researched_at: new Date().toISOString(),
  }

  // ── 8. Persist (upsert — one entity record per lead) ─────────────────────────
  const { data: saved, error: saveErr } = await db
    .from('entity_records')
    .upsert(entityRecord, { onConflict: 'lead_id' })
    .select()
    .single()

  if (saveErr) {
    if (saveErr.code === '42P01') {
      return NextResponse.json(
        {
          errorCode: 'migration_missing',
          error: 'entity_records table not found. Apply migration 008 first.',
          instructions: 'Run supabase/migrations/008_permit_phone_and_entity.sql in the Supabase SQL Editor.',
          entityData: entityRecord,
          decisionMaker,
        },
        { status: 503 }
      )
    }
    console.error('[lookup-entity] save error:', saveErr)
    return NextResponse.json({ errorCode: 'db_error', error: saveErr.message }, { status: 500 })
  }

  // ── 9. Record usage in enrichment_jobs for rate-limit counting ───────────────
  try {
    await db.from('enrichment_jobs').insert({
      lead_id: leadId,
      status: 'completed',
      raw_response: { source: 'cpa_entity_lookup', taxpayer_id: taxpayerId },
      completed_at: new Date().toISOString(),
    })
  } catch { /* best-effort — don't fail the request if this insert fails */ }

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
