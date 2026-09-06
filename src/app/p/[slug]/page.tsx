import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { ProposalTemplate } from '@/components/proposals/ProposalTemplate'

// Only safe, public-facing fields — never expose internal CRM data
const SAFE_SELECT =
  'display_name, outlet_name, taxpayer_name, proposal_slug, proposal_savings_monthly, proposal_transaction_rate, proposal_equipment, proposal_contract, proposal_status, proposal_viewed_at, proposal_accepted_at'

interface PageProps {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const db = createServiceClient()
  const { data } = await db
    .from('leads')
    .select('display_name, outlet_name, taxpayer_name')
    .eq('proposal_slug', slug)
    .maybeSingle()

  if (!data) return { title: 'Proposal | Process.Direct' }

  const businessName = data.display_name || data.outlet_name || data.taxpayer_name || 'Your Business'
  return {
    title: `Proposal for ${businessName} | Process.Direct`,
    description: `A personalized payment-processing proposal for ${businessName} from Process.Direct.`,
  }
}

export default async function ProposalPage({ params }: PageProps) {
  const { slug } = await params
  const db = createServiceClient()

  const { data: lead } = await db
    .from('leads')
    .select(SAFE_SELECT)
    .eq('proposal_slug', slug)
    .maybeSingle()

  if (!lead) notFound()

  // Track first view server-side (fire-and-forget — intentionally not awaited)
  if (!lead.proposal_viewed_at && lead.proposal_status !== 'accepted') {
    void db
      .from('leads')
      .update({ proposal_viewed_at: new Date().toISOString(), proposal_status: 'viewed' })
      .eq('proposal_slug', slug)
  }

  const businessName =
    lead.display_name || lead.outlet_name || lead.taxpayer_name || 'Your Business'

  return (
    <ProposalTemplate
      data={{
        businessName,
        slug,
        savingsMonthly: lead.proposal_savings_monthly ?? null,
        transactionRate: lead.proposal_transaction_rate ?? null,
        equipment: lead.proposal_equipment ?? null,
        contract: lead.proposal_contract ?? null,
        status: lead.proposal_status ?? 'not_sent',
        accepted: lead.proposal_status === 'accepted',
      }}
    />
  )
}
