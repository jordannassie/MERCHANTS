/**
 * POST /api/enrich/research-owner
 * Scrape the business website and use OpenAI to extract decision-maker info.
 * Requires OPENAI_API_KEY (server-only).
 * Returns proposed data for user review; only saves automatically if confidence ≥ 70.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { researchDecisionMaker } from '@/lib/openai-research'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  forceRefresh: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured on this server. Add it to Netlify environment variables to enable decision-maker research.' },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { leadId, forceRefresh } = parsed.data
  const db = createServiceClient()

  // Rate limit: max 20 AI research calls per 60 minutes (OpenAI costs money)
  const rl = await checkRateLimit(db, 'research')
  if (!rl.allowed) return rateLimitExceeded(rl) as unknown as ReturnType<typeof NextResponse.json>

  const { data: lead } = await db
    .from('leads')
    .select('id,display_name,outlet_name,taxpayer_name,outlet_address,outlet_city,outlet_state,outlet_zip,website,primary_phone')
    .eq('id', leadId)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const businessName = lead.outlet_name ?? lead.display_name ?? lead.taxpayer_name ?? ''
  const businessAddress = [lead.outlet_address, lead.outlet_city, lead.outlet_state ?? 'TX', lead.outlet_zip]
    .filter(Boolean).join(', ')

  // Skip if we already have a verified contact for this lead
  if (!forceRefresh) {
    const { data: existingContact } = await db
      .from('contacts')
      .select('id,full_name,title')
      .eq('lead_id', leadId)
      .eq('source_type', 'enriched')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existingContact?.full_name) {
      return NextResponse.json({
        status: 'already_researched',
        contact: existingContact,
      })
    }
  }

  if (!lead.website) {
    return NextResponse.json({
      status: 'no_website',
      error: 'No website found for this lead. Run Find Business Contact first to discover the website.',
    }, { status: 422 })
  }

  let result
  try {
    result = await researchDecisionMaker(businessName, businessAddress, lead.website, openaiKey)
  } catch (e) {
    return NextResponse.json({
      error: `Research failed: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 })
  }

  const now = new Date().toISOString()

  // Store full result in enrichment_jobs for audit trail
  await db.from('enrichment_jobs').insert({
    lead_id: leadId,
    status: result.confidence > 0 ? 'completed' : 'failed',
    ai_score_adjustment: Math.round(result.confidence / 10) - 5,
    ai_score_reason: result.research_summary,
    raw_response: { source: 'openai_web_research', ...result },
    proposed_data: result,
    sources: result.source_urls.map(url => ({ url, title: url })),
    error_message: result.person_name ? null : result.research_summary,
    started_at: now,
    completed_at: now,
  })

  const requiresReview = result.confidence < 70

  // Auto-save if confidence ≥ 70 AND a person was found
  if (!requiresReview && result.person_name) {
    await db.from('contacts').insert({
      lead_id: leadId,
      full_name: result.person_name,
      title: result.job_title,
      email: result.business_email,
      business_phone: result.business_phone ?? lead.primary_phone,
      source_url: result.source_urls[0] ?? lead.website,
      is_primary: true,
      source_type: 'enriched',
      contact_type: inferContactType(result.job_title),
      // Pack extra fields into notes as JSON (works without migration)
      notes: JSON.stringify({
        linkedin_url: result.linkedin_url,
        confidence: result.confidence,
        verification_status: 'verified',
        research_summary: result.research_summary,
        all_source_urls: result.source_urls,
      }),
    })
  }

  return NextResponse.json({
    status: result.person_name ? (requiresReview ? 'review' : 'found') : 'not_found',
    proposed: result,
    requiresReview,
    leadId,
  })
}

function inferContactType(title: string | null): 'owner' | 'manager' | 'decision_maker' | 'other' {
  if (!title) return 'other'
  const t = title.toLowerCase()
  if (t.includes('owner') || t.includes('founder') || t.includes('ceo') || t.includes('president')) return 'owner'
  if (t.includes('manager') || t.includes('director') || t.includes('gm')) return 'manager'
  return 'decision_maker'
}
