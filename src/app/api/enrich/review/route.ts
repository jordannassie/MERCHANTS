import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { z } from 'zod'

const schema = z.object({
  jobId: z.string().uuid(),
  acceptedFields: z.array(z.string()),
})

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { jobId, acceptedFields } = parsed.data

  const { data: job } = await supabase
    .from('enrichment_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'completed') {
    return NextResponse.json({ error: 'Job not complete' }, { status: 400 })
  }

  const proposed = job.proposed_data as Record<string, unknown>
  if (!proposed) return NextResponse.json({ error: 'No proposed data' }, { status: 400 })

  const MAPPABLE = [
    'category', 'website', 'primary_phone', 'primary_email', 'owner_name', 'contact_title',
  ] as const
  const updates: Record<string, unknown> = {}
  for (const field of MAPPABLE) {
    if (acceptedFields.includes(field) && proposed[field] != null) {
      updates[field] = proposed[field]
    }
  }

  if (acceptedFields.includes('score_adjustment') && job.ai_score_adjustment != null) {
    const { data: lead } = await supabase
      .from('leads')
      .select('score')
      .eq('id', job.lead_id)
      .single()
    if (lead) {
      const newScore = Math.max(0, Math.min(100, lead.score + job.ai_score_adjustment))
      updates.score = newScore
      updates.priority =
        newScore >= 75 ? 'hot' : newScore >= 50 ? 'good' : newScore >= 25 ? 'low' : 'skip'
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.enrichment_status = 'completed'
    updates.enriched_at = new Date().toISOString()
    await supabase.from('leads').update(updates).eq('id', job.lead_id)
  }

  await supabase.from('enrichment_jobs').update({ accepted_fields: acceptedFields }).eq('id', jobId)

  return NextResponse.json({ ok: true, applied: updates })
}
