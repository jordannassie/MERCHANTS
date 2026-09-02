import { resolveNaics, naicsScoreModifier } from './naics'
import { detectChain, CHAIN_SCORE_PENALTY } from './chains'

export interface ScoringInput {
  naicsCode: string | null
  permitIssueDate: string | null
  firstSalesDate: string | null
  businessName: string | null
  outletName?: string | null
  taxpayerName?: string | null
  outletAddress: string | null
  taxpayerOrganizationType: string | null
}

export interface ScoringResult {
  score: number
  priority: 'hot' | 'good' | 'low' | 'skip'
  reasons: string[]
  /** Set to 'corporate_chain' when a known chain is detected */
  category: string | null
  /** Name of the detected chain brand, or null */
  detectedChain: string | null
}

export function scoreLead(input: ScoringInput, now: Date = new Date()): ScoringResult {
  let score = 35
  const reasons: string[] = []

  // ── Timing: permit issue date ──────────────────────────────────────────────
  if (input.permitIssueDate) {
    const issued = new Date(input.permitIssueDate)
    const daysSince = Math.floor((now.getTime() - issued.getTime()) / 86_400_000)
    if (daysSince <= 3) {
      score += 20
      reasons.push(`Permit issued ${daysSince === 0 ? 'today' : `${daysSince} day${daysSince === 1 ? '' : 's'} ago`}`)
    } else if (daysSince <= 7) {
      score += 15
      reasons.push(`Permit issued ${daysSince} days ago`)
    } else if (daysSince <= 14) {
      score += 8
      reasons.push(`Permit issued ${daysSince} days ago`)
    }
  }

  // ── Timing: first sales date ───────────────────────────────────────────────
  if (input.firstSalesDate) {
    const firstSales = new Date(input.firstSalesDate)
    const daysUntil = Math.floor((firstSales.getTime() - now.getTime()) / 86_400_000)
    if (daysUntil > 0) {
      score += 20
      const d = firstSales.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      reasons.push(`Opening soon — first sales date ${d} (${daysUntil} days away)`)
    } else {
      const daysSince = Math.abs(daysUntil)
      if (daysSince <= 14) {
        score += 12
        reasons.push(`First sales date was ${daysSince} days ago`)
      } else if (daysSince <= 30) {
        score += 6
        reasons.push(`First sales date was ${daysSince} days ago`)
      }
    }
  }

  // ── NAICS scoring (uses the NAICS dictionary for comprehensive coverage) ──
  const naicsCode = input.naicsCode
  const naics = (naicsCode ?? '').trim()
  if (naics) {
    const resolved = resolveNaics(naics)
    const mod = naicsScoreModifier(naics)
    if (mod !== 0) {
      score += mod
      reasons.push(`${resolved.label} (NAICS ${naics}) — ${resolved.tier} card-processing category`)
    }
  }

  // ── NAICS: government override ────────────────────────────────────────────
  if (naics.startsWith('92')) {
    score -= 40; reasons.push('Government entity')
  }

  // ── Address signals ───────────────────────────────────────────────────────
  const addr = (input.outletAddress ?? '').toLowerCase().trim()
  if (/^p\.?\s*o\.?\s*box\b/.test(addr)) {
    score -= 15; reasons.push('PO Box — no confirmed physical location')
  }

  // ── Business name signals ─────────────────────────────────────────────────
  const name = (input.businessName ?? '').toLowerCase()
  if (/\b(holdings?|investments?|properties)\b/.test(name)) {
    score -= 15; reasons.push('Business name suggests holding / investment entity')
  } else if (/management company/.test(name)) {
    score -= 25; reasons.push('Business name suggests management company')
  }
  if (/\b(school district|isd|city of|county of|municipal|utility district|water district)\b/.test(name)) {
    score -= 40; reasons.push('Possible government / school / utility entity')
  }

  // ── Org type signals ──────────────────────────────────────────────────────
  const orgType = (input.taxpayerOrganizationType ?? '').toLowerCase()
  if (orgType.includes('government') || orgType.includes('municipal')) {
    score -= 40; reasons.push('Taxpayer org type: government')
  }

  // ── Chain / corporate detection ───────────────────────────────────────────
  const { isChain, chainName } = detectChain(input.outletName, input.taxpayerName)
  if (isChain) {
    score -= CHAIN_SCORE_PENALTY
    reasons.push(
      `${chainName ?? 'Corporate chain'} — payment-processing decisions are made centrally, not by local management`
    )
  }

  // ── Clamp ─────────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score))

  let priority: 'hot' | 'good' | 'low' | 'skip'
  if (score >= 75) priority = isChain ? 'good' : 'hot'  // chains can never be HOT
  else if (score >= 50) priority = 'good'
  else if (score >= 25) priority = 'low'
  else priority = 'skip'

  return {
    score,
    priority,
    reasons,
    category: isChain ? 'corporate_chain' : null,
    detectedChain: chainName,
  }
}
