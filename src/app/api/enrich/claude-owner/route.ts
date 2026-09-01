/**
 * POST /api/enrich/claude-owner
 * Research public owner/decision-maker via Claude web search.
 * Body: { leadId: string }
 * Returns proposed data for user review before saving.
 *
 * ANTHROPIC_API_KEY must be set server-side (never NEXT_PUBLIC).
 * If not configured, returns a 503 with a clear message.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const schema = z.object({ leadId: z.string().uuid() })

const RESEARCH_SCHEMA = z.object({
  decision_maker_name: z.string().nullable().optional(),
  decision_maker_title: z.string().nullable().optional(),
  public_business_email: z.string().nullable().optional(),
  public_business_phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  facebook_url: z.string().nullable().optional(),
  instagram_url: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  opening_status: z.enum(['open', 'opening_soon', 'closed', 'unknown']).nullable().optional(),
  opening_date: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  match_confidence: z.number().min(0).max(100),
  sources: z.array(z.object({ url: z.string(), title: z.string() })).optional(),
  warnings: z.array(z.string()).optional(),
})

export async function POST(request: NextRequest) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured on this server. Add it to Netlify environment variables.' },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: lead } = await db
    .from('leads')
    .select('id,display_name,outlet_name,taxpayer_name,outlet_address,outlet_city,outlet_state,outlet_zip,naics_code,permit_issue_date,first_sales_date,website,primary_phone')
    .eq('id', parsed.data.leadId)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const businessName = lead.outlet_name ?? lead.display_name ?? lead.taxpayer_name ?? 'Unknown'
  const address = [lead.outlet_address, lead.outlet_city, lead.outlet_state ?? 'TX', lead.outlet_zip]
    .filter(Boolean).join(', ')

  const prompt = `You are a business research assistant. Using web search, find publicly available information about this business.

Business name: ${businessName}
Address: ${address}
NAICS code: ${lead.naics_code ?? 'unknown'}
Texas permit issued: ${lead.permit_issue_date ?? 'unknown'}
First sales date: ${lead.first_sales_date ?? 'unknown'}
Known website: ${lead.website ?? 'none found yet'}
Known phone: ${lead.primary_phone ?? 'none found yet'}

RESEARCH TASK:
1. Search for the business by name AND address to confirm you have the correct location.
2. Find the public owner, founder, general manager, or primary decision-maker.
3. Find any public business email or phone number.
4. Find official website, Facebook, Instagram, LinkedIn pages.
5. Determine if the business is open, opening soon, or has an announced opening date.
6. Write a concise 2-sentence business summary.

STRICT RULES:
- Only return publicly available information.
- Do not guess or invent information.
- Return null for any field you cannot verify with a source.
- Do not treat a registered agent as the business owner.
- Match by name PLUS address/city to avoid confusing similarly-named businesses.
- Every factual field must have a source URL.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "decision_maker_name": string or null,
  "decision_maker_title": string or null,
  "public_business_email": string or null,
  "public_business_phone": string or null,
  "website": string or null,
  "facebook_url": string or null,
  "instagram_url": string or null,
  "linkedin_url": string or null,
  "opening_status": "open" | "opening_soon" | "closed" | "unknown" | null,
  "opening_date": string or null,
  "summary": string or null,
  "match_confidence": number 0-100,
  "sources": [{"url": string, "title": string}],
  "warnings": [string]
}`

  let claudeResponse: string
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Claude API error ${res.status}: ${err.slice(0, 300)}` }, { status: 500 })
    }

    const data = await res.json()

    // Log token usage
    if (data.usage) {
      console.log(`[claude-owner] tokens: ${JSON.stringify(data.usage)}`)
    }

    // Extract text content from the response
    const textBlock = data.content?.find((c: { type: string }) => c.type === 'text')
    claudeResponse = textBlock?.text ?? ''
  } catch (e) {
    return NextResponse.json({ error: `Request failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  // Parse JSON from response
  let proposed: z.infer<typeof RESEARCH_SCHEMA>
  try {
    const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    const raw = JSON.parse(jsonMatch[0])
    const result = RESEARCH_SCHEMA.safeParse(raw)
    if (!result.success) throw new Error(result.error.message)
    proposed = result.data
  } catch (e) {
    return NextResponse.json({
      error: `Could not parse Claude response: ${e instanceof Error ? e.message : String(e)}`,
      rawResponse: claudeResponse.slice(0, 500),
    }, { status: 500 })
  }

  // Save raw response in enrichment_jobs for auditing
  await db.from('enrichment_jobs').insert({
    lead_id: parsed.data.leadId,
    status: 'completed',
    raw_response: { claude_response: claudeResponse },
    proposed_data: proposed,
    sources: proposed.sources,
    completed_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  })

  return NextResponse.json({
    proposed,
    leadId: parsed.data.leadId,
    requiresReview: (proposed.match_confidence ?? 0) < 85,
  })
}
