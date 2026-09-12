import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildInitialOutreachMessage,
  getInitialOutreachTemplate,
  isInitialSmsCompliant,
} from '@/lib/outreach'
import { ensureProposalSlug, getProposalUrl } from '@/lib/proposals'

export interface InitialSmsRender {
  message: string
  proposalUrl: string
  slug: string
  businessName: string
  city: string
  compliant: boolean
}

export async function renderInitialSmsForLead(
  db: SupabaseClient,
  lead: {
    id: string
    display_name?: string | null
    outlet_name?: string | null
    taxpayer_name?: string | null
    outlet_city?: string | null
  },
): Promise<InitialSmsRender> {
  const businessName =
    lead.display_name || lead.outlet_name || lead.taxpayer_name || 'your business'
  const city = lead.outlet_city ?? null
  const slug = await ensureProposalSlug(db, lead.id, businessName)
  const proposalUrl = getProposalUrl(slug)
  const template = await getInitialOutreachTemplate(db)
  const message = buildInitialOutreachMessage(businessName, proposalUrl, city, template)

  return {
    message,
    proposalUrl,
    slug,
    businessName,
    city: city?.trim() || 'your area',
    compliant: isInitialSmsCompliant(message, proposalUrl),
  }
}
