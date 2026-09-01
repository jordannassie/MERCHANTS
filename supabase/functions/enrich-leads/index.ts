// Supabase Edge Function — enrich-leads (Phase 4)
// Requires ANTHROPIC_API_KEY in Edge Function secrets (never in browser).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ENRICHMENT_DAILY_CAP = 25

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (!anthropicKey) return json({ error: 'Enrichment not configured (ANTHROPIC_API_KEY missing)' }, 503)

  // ── Auth — must be a real user
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const token = authHeader.slice(7)
  const userClient = createClient(supabaseUrl, anonKey)
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const body = await req.json().catch(() => ({}))
  const leadIds: string[] = Array.isArray(body.leadIds) ? body.leadIds.slice(0, ENRICHMENT_DAILY_CAP) : []
  if (!leadIds.length) return json({ error: 'leadIds required' }, 400)

  // ── Daily cap check
  const today = new Date(); today.setHours(0,0,0,0)
  const { count: todayCount } = await adminClient
    .from('enrichment_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .gte('created_at', today.toISOString())

  const remaining = ENRICHMENT_DAILY_CAP - (todayCount ?? 0)
  if (remaining <= 0) return json({ error: `Daily enrichment cap (${ENRICHMENT_DAILY_CAP}) reached` }, 429)

  const toProcess = leadIds.slice(0, remaining)
  const results = []

  for (const leadId of toProcess) {
    // Verify lead ownership
    const { data: lead } = await adminClient.from('leads').select('*').eq('id', leadId).eq('owner_id', user.id).single()
    if (!lead) { results.push({ leadId, error: 'Lead not found or unauthorized' }); continue }

    // Create job record
    const { data: job } = await adminClient.from('enrichment_jobs').insert({
      owner_id: user.id, lead_id: leadId, status: 'running', started_at: new Date().toISOString(),
    }).select().single()

    if (!job) { results.push({ leadId, error: 'Failed to create job' }); continue }

    try {
      const enrichResult = await enrichLead(lead, anthropicKey)

      await adminClient.from('enrichment_jobs').update({
        status: 'completed',
        raw_response: enrichResult.raw,
        proposed_data: enrichResult.proposed,
        sources: enrichResult.sources,
        ai_score_adjustment: enrichResult.scoreAdjustment,
        ai_score_reason: enrichResult.scoreReason,
        input_tokens: enrichResult.inputTokens,
        output_tokens: enrichResult.outputTokens,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id)

      results.push({ leadId, jobId: job.id, status: 'completed', proposed: enrichResult.proposed })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await adminClient.from('enrichment_jobs').update({
        status: 'failed', error_message: msg, completed_at: new Date().toISOString(),
      }).eq('id', job.id)
      results.push({ leadId, jobId: job.id, status: 'failed', error: msg })
    }
  }

  return json({ results, dailyCapRemaining: remaining - toProcess.length })
})

async function enrichLead(lead: Record<string, unknown>, apiKey: string) {
  const prompt = buildPrompt(lead)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
  const data = await res.json()

  // Extract text content from response
  const textContent = data.content?.find((c: Record<string, unknown>) => c.type === 'text')?.text ?? ''
  const usage = data.usage ?? {}

  // Parse JSON from Claude's response
  const jsonMatch = textContent.match(/```json\s*([\s\S]*?)```/) ?? textContent.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No structured JSON in Claude response')

  const raw = JSON.parse(jsonMatch[1] ?? jsonMatch[0])
  validateEnrichmentResponse(raw)

  return {
    raw,
    proposed: buildProposed(raw),
    sources: raw.sources ?? [],
    scoreAdjustment: clamp(raw.score_adjustment ?? 0, -10, 10),
    scoreReason: raw.score_reason ?? null,
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
  }
}

function buildPrompt(lead: Record<string, unknown>): string {
  const name = lead.display_name ?? lead.outlet_name ?? lead.taxpayer_name
  const address = [lead.outlet_address, lead.outlet_city, lead.outlet_state, lead.outlet_zip].filter(Boolean).join(', ')
  return `Research this business for merchant services prospecting. Use web search to find publicly available information only.

Business: ${name}
Address: ${address}
NAICS: ${lead.naics_code ?? 'unknown'}
Permit issued: ${lead.permit_issue_date ?? 'unknown'}
First sales date: ${lead.first_sales_date ?? 'unknown'}

INSTRUCTIONS:
- Search for the business by name AND address/city to distinguish it from similarly named companies
- Only report publicly listed business phone/email (not personal contacts)
- Return null for any field you cannot find with a supporting source
- Every factual field must have a source URL
- Do not guess or invent data
- Do not treat registered agents as business decision-makers

Return ONLY valid JSON in this exact format:
\`\`\`json
{
  "match_confidence": 0-100,
  "business_summary": "string or null",
  "category": "string or null",
  "official_website": "url or null",
  "public_business_phone": "phone or null",
  "public_business_email": "email or null",
  "decision_maker_name": "name or null",
  "decision_maker_title": "title or null",
  "opening_status": "open|opening_soon|closed|unknown",
  "opening_date": "date or null",
  "merchant_fit": "high|medium|low|unknown",
  "score_adjustment": -10 to 10,
  "score_reason": "string or null",
  "sources": [{"url": "...", "title": "...", "fields": ["..."]}],
  "warnings": ["..."]
}
\`\`\``
}

function validateEnrichmentResponse(raw: unknown): void {
  if (typeof raw !== 'object' || !raw) throw new Error('Invalid response: not an object')
  const r = raw as Record<string, unknown>
  if (typeof r.match_confidence !== 'number') throw new Error('match_confidence must be a number')
  if (!['high','medium','low','unknown'].includes(r.merchant_fit as string)) {
    (r as Record<string, unknown>).merchant_fit = 'unknown'
  }
}

function buildProposed(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    category: raw.category ?? null,
    website: raw.official_website ?? null,
    primary_phone: raw.public_business_phone ?? null,
    primary_email: raw.public_business_email ?? null,
    owner_name: raw.decision_maker_name ?? null,
    contact_title: raw.decision_maker_title ?? null,
    match_confidence: raw.match_confidence ?? null,
    opening_status: raw.opening_status ?? null,
    merchant_fit: raw.merchant_fit ?? 'unknown',
    business_summary: raw.business_summary ?? null,
    warnings: raw.warnings ?? [],
  }
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
