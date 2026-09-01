'use server'

import { createClient } from '@/lib/supabase/server'
import type { Lead } from '@/lib/types'

export async function updateLeadCRM(leadId: string, data: Partial<Lead>): Promise<Partial<Lead> | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

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

  const { data: updated } = await supabase
    .from('leads')
    .update(safe)
    .eq('id', leadId)
    .eq('owner_id', user.id)
    .select()
    .single()

  return updated
}

export async function updateLeadStatus(leadId: string, status: Lead['status']): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('leads')
    .update({ status })
    .eq('id', leadId)
    .eq('owner_id', user.id)
}

export async function starLead(leadId: string, starred: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('leads')
    .update({ starred })
    .eq('id', leadId)
    .eq('owner_id', user.id)
}
