/**
 * OpenAI-powered decision-maker research.
 * SERVER-ONLY — OPENAI_API_KEY must never be exposed to the browser.
 *
 * Algorithm:
 * 1. Fetch likely public pages from the business website (About, Team, Contact, etc.)
 * 2. Send scraped content to GPT-4o-mini for structured extraction
 * 3. Return verified person + sources with a confidence score
 */

export interface DecisionMakerResult {
  person_name: string | null
  job_title: string | null
  business_email: string | null
  business_phone: string | null
  linkedin_url: string | null
  source_urls: string[]
  confidence: number
  research_summary: string
}

const CANDIDATE_PATHS = [
  '',           // homepage
  '/about',
  '/about-us',
  '/team',
  '/our-team',
  '/leadership',
  '/staff',
  '/contact',
  '/contact-us',
  '/our-story',
  '/meet-us',
  '/meet-the-team',
  '/people',
  '/management',
]

const FETCH_TIMEOUT_MS = 8_000
const MAX_CONTENT_CHARS = 6_000 // per page, trimmed before sending to GPT

/** Strip HTML tags and collapse whitespace for LLM input */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function fetchPage(url: string): Promise<{ url: string; content: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MerchantRadar/1.0; business-research)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = stripHtml(html).slice(0, MAX_CONTENT_CHARS)
    if (text.length < 50) return null
    return { url, content: text }
  } catch {
    return null
  }
}

async function scrapeWebsite(websiteUrl: string): Promise<Array<{ url: string; content: string }>> {
  // Normalise base URL
  let base: URL
  try {
    base = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`)
  } catch {
    return []
  }
  base.pathname = ''
  base.search = ''

  const pages: Array<{ url: string; content: string }> = []

  // Fetch pages in batches of 4 (concurrently, with rate-limiting)
  const chunks: string[][] = []
  for (let i = 0; i < CANDIDATE_PATHS.length; i += 4) {
    chunks.push(CANDIDATE_PATHS.slice(i, i + 4))
  }

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(p => fetchPage(`${base.origin}${p}`))
    )
    results.forEach(r => { if (r) pages.push(r) })
    if (pages.length >= 5) break // Enough material for analysis
  }

  return pages
}

async function analyseWithOpenAI(
  businessName: string,
  businessAddress: string,
  pages: Array<{ url: string; content: string }>,
  apiKey: string
): Promise<DecisionMakerResult> {
  const pageContent = pages
    .map(p => `=== ${p.url} ===\n${p.content}`)
    .join('\n\n')
    .slice(0, 24_000) // total token budget

  const systemPrompt = `You are a business researcher extracting ONLY publicly available information about business owners and decision-makers. You never invent names, emails, or phone numbers. If you cannot verify a fact from the provided content, return null for that field. Every person you identify MUST appear explicitly in the content with their name and role.`

  const userPrompt = `Research the decision-maker for this Texas business:

Business: ${businessName}
Address: ${businessAddress}

You have been given text scraped from the business website. Analyse it and extract the most senior publicly named person you can verify. Look for: Owner, Founder, Co-Founder, General Manager, Location Manager, Managing Director, CEO, President, or similar.

RULES:
1. The person MUST be explicitly named in the content with a role or title.
2. Do NOT invent email addresses from name patterns.
3. Do NOT treat a registered agent as the business owner.
4. Every factual field must be supported by the content provided.
5. If you find multiple people, choose the most senior or decision-making role.
6. If nobody is named with a clear business role, return null for person_name and set confidence below 30.

Source content from website:
${pageContent}

Return ONLY a valid JSON object with exactly these keys:
{
  "person_name": string or null,
  "job_title": string or null,
  "business_email": string or null,
  "business_phone": string or null,
  "linkedin_url": string or null,
  "source_urls": [array of page URLs where person was found],
  "confidence": integer 0-100,
  "research_summary": "one or two sentence plain-English summary of what was found and why"
}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? '{}'

  let parsed: Partial<DecisionMakerResult>
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('OpenAI returned non-JSON response')
  }

  // Log token usage for cost visibility
  if (data.usage) {
    console.log(`[openai-research] tokens: prompt=${data.usage.prompt_tokens} completion=${data.usage.completion_tokens}`)
  }

  return {
    person_name: typeof parsed.person_name === 'string' ? parsed.person_name : null,
    job_title: typeof parsed.job_title === 'string' ? parsed.job_title : null,
    business_email: typeof parsed.business_email === 'string' ? parsed.business_email : null,
    business_phone: typeof parsed.business_phone === 'string' ? parsed.business_phone : null,
    linkedin_url: typeof parsed.linkedin_url === 'string' ? parsed.linkedin_url : null,
    source_urls: Array.isArray(parsed.source_urls) ? (parsed.source_urls as string[]).filter(s => typeof s === 'string') : pages.map(p => p.url),
    confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 0,
    research_summary: typeof parsed.research_summary === 'string'
      ? parsed.research_summary
      : 'Decision-maker not verified — call the business and ask for the owner or manager.',
  }
}

/** Main exported function — scrapes website then uses OpenAI to extract person info */
export async function researchDecisionMaker(
  businessName: string,
  businessAddress: string,
  websiteUrl: string,
  apiKey: string
): Promise<DecisionMakerResult> {
  const pages = await scrapeWebsite(websiteUrl)

  if (pages.length === 0) {
    return {
      person_name: null,
      job_title: null,
      business_email: null,
      business_phone: null,
      linkedin_url: null,
      source_urls: [],
      confidence: 0,
      research_summary: `Could not access ${websiteUrl}. Decision-maker not verified — call the business and ask for the owner or manager.`,
    }
  }

  return analyseWithOpenAI(businessName, businessAddress, pages, apiKey)
}
