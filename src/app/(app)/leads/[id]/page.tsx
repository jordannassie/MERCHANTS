import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Lead, Contact, Activity } from '@/lib/types'
import { fmtDate, fmtPhone, fmtDateTime, STATUS_COLORS, PRIORITY_COLORS, safeUrl, buildMapsUrl } from '@/lib/utils'
import { DFW_COUNTIES } from '@/lib/constants'
import { LeadDetailClient } from '@/components/leads/LeadDetailClient'

interface PageProps { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: lead } = await supabase
    .from('leads').select('*').eq('id', id).eq('owner_id', user.id).single()
  if (!lead) notFound()

  const [{ data: contacts }, { data: activities }] = await Promise.all([
    supabase.from('contacts').select('*').eq('lead_id', id).order('is_primary', { ascending: false }).order('created_at'),
    supabase.from('activities').select('*, contact:contacts(full_name)').eq('lead_id', id).order('occurred_at', { ascending: false }).limit(50),
  ])

  return (
    <LeadDetailClient
      lead={lead as Lead}
      contacts={(contacts ?? []) as Contact[]}
      activities={(activities ?? []) as (Activity & { contact?: { full_name: string } | null })[]}
    />
  )
}
