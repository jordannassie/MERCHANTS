'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceOwnerId } from '@/lib/workspace'
import type { Lead } from '@/lib/types'

export async function updateLeadCRM(leadId: string, data: Partial<Lead>): Promise<Partial<Lead> | null> {
  const db = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()

  const safe = {
    display_name: data.display_name,
    primary_phone: data.primary_phone,
    primary_email: data.primary_email,
    website: data.website,
    owner_name: data.owner_name,
    contact_title: data.contact_title,
    category: data.category,
    est_monthly_processing: data.est_monthly_processing,
    google_maps_url: data.google_maps_url,
  }

  const { data: updated } = await db
    .from('leads')
    .update(safe)
    .eq('id', leadId)
    .eq('owner_id', ownerId)
    .select()
    .single()

  return updated
}

export async function updateLeadStatus(leadId: string, status: Lead['status']): Promise<void> {
  const db = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()
  await db.from('leads').update({ status }).eq('id', leadId).eq('owner_id', ownerId)
}

export async function starLead(leadId: string, starred: boolean): Promise<void> {
  const db = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()
  await db.from('leads').update({ starred }).eq('id', leadId).eq('owner_id', ownerId)
}
