export interface ScoringInput {
  naicsCode: string | null
  permitIssueDate: string | null
  firstSalesDate: string | null
  businessName: string | null
  outletAddress: string | null
  taxpayerOrganizationType: string | null
}

export interface ScoringResult {
  score: number
  priority: 'hot' | 'good' | 'low' | 'skip'
  reasons: string[]
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

  // ── NAICS: positive signals ───────────────────────────────────────────────
  const naics = (input.naicsCode ?? '').trim()
  if (naics.startsWith('722')) {
    score += 20; reasons.push('Restaurant / food service (NAICS 722)')
  } else if (naics.startsWith('8121')) {
    score += 18; reasons.push('Personal care / salon (NAICS 8121)')
  } else if (naics.startsWith('8111')) {
    score += 18; reasons.push('Automotive repair (NAICS 8111)')
  } else if (naics.startsWith('71394')) {
    score += 18; reasons.push('Fitness / recreation (NAICS 71394)')
  } else if (naics.startsWith('6212')) {
    score += 20; reasons.push('Dental office (NAICS 6212)')
  } else if (naics.startsWith('6213')) {
    score += 14; reasons.push('Healthcare practitioner (NAICS 6213)')
  } else if (naics.startsWith('6214')) {
    score += 18; reasons.push('Outpatient care center (NAICS 6214)')
  } else if (['445', '449', '455'].some(p => naics.startsWith(p))) {
    score += 12; reasons.push(`Retail (NAICS ${naics.slice(0, 3)})`)
  } else if (naics.startsWith('238')) {
    score += 8; reasons.push('Specialty contractor (NAICS 238)')
  }

  // ── NAICS: negative signals ───────────────────────────────────────────────
  if (naics.startsWith('531')) {
    score -= 20; reasons.push('Real estate — lower card-processing likelihood')
  }
  if (naics.startsWith('523') || naics.startsWith('525')) {
    score -= 20; reasons.push('Financial / investment entity')
  }
  if (naics.startsWith('551')) {
    score -= 35; reasons.push('Holding company structure')
  }
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

  // ── Clamp ─────────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score))

  let priority: 'hot' | 'good' | 'low' | 'skip'
  if (score >= 75) priority = 'hot'
  else if (score >= 50) priority = 'good'
  else if (score >= 25) priority = 'low'
  else priority = 'skip'

  return { score, priority, reasons }
}
