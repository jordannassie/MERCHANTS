/**
 * POST /api/enrich/run-full-research
 * Run the full pipeline: Google Places → decision-maker research.
 * Body: { leadId: string, skipIfEnriched?: boolean }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  leadId: z.string().uuid(),
  skipIfEnriched: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { leadId, skipIfEnriched } = parsed.data
  const base = request.nextUrl.origin

  // Step 1 — Google Places
  const contactRes = await fetch(`${base}/api/enrich/find-contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId, forceRefresh: !skipIfEnriched }),
  })
  const contactData = await contactRes.json()

  // Step 2 — Decision-maker (only if website was found and OpenAI is configured)
  let ownerData = null
  if (contactData.lead?.website || contactData.status === 'already_enriched') {
    const ownerRes = await fetch(`${base}/api/enrich/research-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, forceRefresh: !skipIfEnriched }),
    })
    // 503 = OpenAI not configured → not a failure
    if (ownerRes.status !== 503) {
      ownerData = await ownerRes.json()
    }
  }

  return NextResponse.json({
    leadId,
    contact: contactData,
    owner: ownerData,
    websiteFound: !!(contactData.lead?.website),
    phoneFound: !!(contactData.lead?.primary_phone),
  })
}
