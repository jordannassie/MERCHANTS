import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceOwnerId } from '@/lib/workspace'
import type { Lead, Contact, Activity } from '@/lib/types'
import { fmtDate, fmtPhone, fmtDateTime, STATUS_COLORS, PRIORITY_COLORS, safeUrl, buildMapsUrl } from '@/lib/utils'
import { DFW_COUNTIES } from '@/lib/constants'
import { LeadDetailClient } from '@/components/leads/LeadDetailClient'

interface PageProps { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()

  const { data: lead } = await supabase
    .from('leads').select('*').eq('id', id).eq('owner_id', ownerId).single()
  if (!lead) notFound()

  const [{ data: contacts }, { data: activities }] = await Promise.all([
    supabase.from('contacts').select('*').eq('lead_id', id).eq('owner_id', ownerId).order('is_primary', { ascending: false }).order('created_at'),
    supabase.from('activities').select('*, contact:contacts(full_name)').eq('lead_id', id).eq('owner_id', ownerId).order('occurred_at', { ascending: false }).limit(50),
  ])

  return (
    <LeadDetailClient
      lead={lead as Lead}
      contacts={(contacts ?? []) as Contact[]}
      activities={(activities ?? []) as (Activity & { contact?: { full_name: string } | null })[]}
    />
  )
}
