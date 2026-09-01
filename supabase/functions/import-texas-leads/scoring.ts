// Scoring module for import edge function (Deno-compatible, no external imports)

interface ScoringInput {
  naicsCode: string | null
  permitIssueDate: string | null
  firstSalesDate: string | null
  businessName: string | null
  outletAddress: string | null
  taxpayerOrganizationType: string | null
}

interface ScoringResult {
  score: number
  priority: 'hot' | 'good' | 'low' | 'skip'
  reasons: string[]
}

export function scoreLead(input: ScoringInput, now: Date = new Date()): ScoringResult {
  let score = 35
  const reasons: string[] = []

  if (input.permitIssueDate) {
    const issued = new Date(input.permitIssueDate)
    const days = Math.floor((now.getTime() - issued.getTime()) / 86_400_000)
    if (days <= 3) { score += 20; reasons.push(`Permit issued ${days <= 0 ? 'today' : days + ' days ago'}`) }
    else if (days <= 7) { score += 15; reasons.push(`Permit issued ${days} days ago`) }
    else if (days <= 14) { score += 8; reasons.push(`Permit issued ${days} days ago`) }
  }

  if (input.firstSalesDate) {
    const fs = new Date(input.firstSalesDate)
    const daysUntil = Math.floor((fs.getTime() - now.getTime()) / 86_400_000)
    if (daysUntil > 0) { score += 20; reasons.push(`Opening soon — first sales ${fs.toISOString().slice(0,10)}`) }
    else if (Math.abs(daysUntil) <= 14) { score += 12; reasons.push(`First sales date was ${Math.abs(daysUntil)} days ago`) }
    else if (Math.abs(daysUntil) <= 30) { score += 6; reasons.push(`First sales date was ${Math.abs(daysUntil)} days ago`) }
  }

  const naics = (input.naicsCode ?? '').trim()
  if (naics.startsWith('722')) { score += 20; reasons.push('Restaurant/food service (NAICS 722)') }
  else if (naics.startsWith('8121')) { score += 18; reasons.push('Personal care/salon (NAICS 8121)') }
  else if (naics.startsWith('8111')) { score += 18; reasons.push('Automotive repair (NAICS 8111)') }
  else if (naics.startsWith('71394')) { score += 18; reasons.push('Fitness/recreation (NAICS 71394)') }
  else if (naics.startsWith('6212')) { score += 20; reasons.push('Dental office (NAICS 6212)') }
  else if (naics.startsWith('6213')) { score += 14; reasons.push('Healthcare practitioner (NAICS 6213)') }
  else if (naics.startsWith('6214')) { score += 18; reasons.push('Outpatient care (NAICS 6214)') }
  else if (['445','449','455'].some(p => naics.startsWith(p))) { score += 12; reasons.push(`Retail (NAICS ${naics.slice(0,3)})`) }
  else if (naics.startsWith('238')) { score += 8; reasons.push('Specialty contractor (NAICS 238)') }

  if (naics.startsWith('531')) { score -= 20; reasons.push('Real estate') }
  if (naics.startsWith('523') || naics.startsWith('525')) { score -= 20; reasons.push('Financial/investment entity') }
  if (naics.startsWith('551')) { score -= 35; reasons.push('Holding company') }
  if (naics.startsWith('92')) { score -= 40; reasons.push('Government entity') }

  const addr = (input.outletAddress ?? '').toLowerCase().trim()
  if (/^p\.?\s*o\.?\s*box\b/.test(addr)) { score -= 15; reasons.push('PO Box — no physical location') }

  const name = (input.businessName ?? '').toLowerCase()
  if (/\b(holdings?|investments?|properties)\b/.test(name)) { score -= 15; reasons.push('Possible holding/investment entity') }
  else if (/management company/.test(name)) { score -= 25; reasons.push('Management company') }
  if (/\b(school district|isd|city of|county of|municipal|utility district|water district)\b/.test(name)) { score -= 40; reasons.push('Government/school/utility entity') }

  const orgType = (input.taxpayerOrganizationType ?? '').toLowerCase()
  if (orgType.includes('government') || orgType.includes('municipal')) { score -= 40; reasons.push('Govt org type') }

  score = Math.max(0, Math.min(100, score))
  const priority = score >= 75 ? 'hot' : score >= 50 ? 'good' : score >= 25 ? 'low' : 'skip'
  return { score, priority, reasons }
}
