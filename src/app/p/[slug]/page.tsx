import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { ProposalTemplate } from '@/components/proposals/ProposalTemplate'

// Only safe, public-facing fields — never expose internal CRM data
const SAFE_SELECT =
  'display_name, outlet_name, taxpayer_name, proposal_slug, proposal_savings_monthly, proposal_transaction_rate, proposal_equipment, proposal_contract, proposal_status, proposal_viewed_at, proposal_accepted_at, proposal_view_count, estimated_monthly_card_sales'

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

// Calculator setting keys fetched from system_settings
const CALC_SETTINGS_KEYS = [
  'proposal_compare_rate_default',
  'proposal_wholesale_cost_default',
  'proposal_markup_rate_default',
  'proposal_customer_pay_percent_default',
  'proposal_slider_default',
  'proposal_slider_min',
  'proposal_slider_max',
  'proposal_slider_step',
]

export default async function ProposalPage({ params }: PageProps) {
  const { slug } = await params
  const db = createServiceClient()

  const [{ data: lead }, { data: settingsRows }] = await Promise.all([
    db
      .from('leads')
      .select(SAFE_SELECT)
      .eq('proposal_slug', slug)
      .maybeSingle(),
    db
      .from('system_settings')
      .select('key, value')
      .in('key', CALC_SETTINGS_KEYS),
  ])

  if (!lead) notFound()

  // Build settings map with fallbacks
  const settingsMap = Object.fromEntries(
    (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  )

  const calcSettings = {
    compareRate:         parseFloat(settingsMap['proposal_compare_rate_default']        ?? '3.0'),
    wholesaleCost:       parseFloat(settingsMap['proposal_wholesale_cost_default']      ?? '1.60'),
    markupRate:          parseFloat(settingsMap['proposal_markup_rate_default']         ?? '0.75'),
    customerPayPercent:  parseFloat(settingsMap['proposal_customer_pay_percent_default'] ?? '4.0'),
    sliderDefault:       parseInt(settingsMap['proposal_slider_default']                ?? '50000', 10),
    sliderMin:           parseInt(settingsMap['proposal_slider_min']                    ?? '5000',  10),
    sliderMax:           parseInt(settingsMap['proposal_slider_max']                    ?? '250000',10),
    sliderStep:          parseInt(settingsMap['proposal_slider_step']                   ?? '5000',  10),
  }

  // Track every view server-side (fire-and-forget — intentionally not awaited)
  const now = new Date().toISOString()
  const viewedAt = lead.proposal_viewed_at ?? now
  // Only update status to 'viewed' if not already at a later stage
  const protectedStatuses = ['agreement_requested', 'accepted']
  const newStatus = protectedStatuses.includes(lead.proposal_status ?? '')
    ? lead.proposal_status
    : 'viewed'

  void db
    .from('leads')
    .update({
      proposal_view_count:     (lead.proposal_view_count ?? 0) + 1,
      proposal_last_viewed_at: now,
      proposal_viewed_at:      viewedAt,
      proposal_status:         newStatus,
    })
    .eq('proposal_slug', slug)

  const businessName =
    lead.display_name || lead.outlet_name || lead.taxpayer_name || 'Your Business'

  return (
    <ProposalTemplate
      data={{
        businessName,
        slug,
        savingsMonthly:              lead.proposal_savings_monthly ?? null,
        transactionRate:             lead.proposal_transaction_rate ?? null,
        equipment:                   lead.proposal_equipment ?? null,
        contract:                    lead.proposal_contract ?? null,
        status:                      lead.proposal_status ?? 'not_sent',
        accepted:
          lead.proposal_status === 'accepted' ||
          lead.proposal_status === 'agreement_requested',
        estimatedMonthlyCardSales:   lead.estimated_monthly_card_sales ?? null,
        calcSettings,
      }}
    />
  )
}
