/**
 * NAICS (North American Industry Classification System) category dictionary.
 *
 * Focused on Texas consumer-facing, card-heavy businesses relevant to
 * merchant services prospecting. Source: census.gov/naics 2022 edition.
 *
 * Each entry maps a NAICS code prefix → { label, tier }
 *   tier 'priority'  — high card volume, customer-facing, great prospect
 *   tier 'good'      — moderate card volume, worth pursuing
 *   tier 'neutral'   — average, evaluate individually
 *   tier 'low'       — unlikely significant consumer card volume
 *   tier 'skip'      — holding co, financial entity, residential, not a sales prospect
 */

export type NaicsTier = 'priority' | 'good' | 'neutral' | 'low' | 'skip'

export interface NaicsCategory {
  label: string
  tier: NaicsTier
  description?: string
}

// Key: prefix (2–6 digits). More-specific codes override shorter prefixes.
const NAICS_MAP: Record<string, NaicsCategory> = {
  // ── Restaurants & Food Service (priority) ──────────────────────────────────
  // 3-digit fallback catches any restaurant code not matched below
  '722':    { label: 'Food Service / Restaurant',     tier: 'priority' },

  // 2017 NAICS codes (still used by some TX records)
  '7221':   { label: 'Full-Service Restaurant',       tier: 'priority' },
  '72211':  { label: 'Full-Service Restaurant',       tier: 'priority' },
  '722110': { label: 'Full-Service Restaurant',       tier: 'priority' },
  '7222':   { label: 'Limited-Service Restaurant',    tier: 'priority' },
  '72221':  { label: 'Limited-Service Restaurant',    tier: 'priority' },
  '722211': { label: 'Fast Food Restaurant',          tier: 'priority' },
  '722212': { label: 'Cafeteria / Grill Buffet',      tier: 'priority' },
  '722213': { label: 'Snack / Non-Alcoholic Bar',     tier: 'priority' },
  '7223':   { label: 'Special Food Services',         tier: 'priority' },
  '722310': { label: 'Food Service Contractor',       tier: 'priority' },
  '722320': { label: 'Caterer',                       tier: 'priority' },
  '722330': { label: 'Mobile Food Services',          tier: 'priority' },
  '722410': { label: 'Drinking Place (Bar)',           tier: 'priority' },
  '7224':   { label: 'Bar / Drinking Place',          tier: 'priority' },

  // 2022 NAICS codes — TX Comptroller uses these for new permits
  // 7225 = Restaurants and Other Eating Places (replaces 7221-7224)
  '7225':   { label: 'Restaurant / Eating Place',     tier: 'priority' },
  '72251':  { label: 'Full-Service Restaurant',       tier: 'priority' },
  '722511': { label: 'Full-Service Restaurant',       tier: 'priority' },
  '72252':  { label: 'Limited-Service Restaurant',    tier: 'priority' },
  '722513': { label: 'Limited-Service Restaurant',    tier: 'priority' },
  '722514': { label: 'Cafeteria / Grill Buffet',      tier: 'priority' },
  '722515': { label: 'Snack / Non-Alcoholic Bar',     tier: 'priority' },
  '72253':  { label: 'Special Food Services',         tier: 'priority' },
  '722530': { label: 'Special Food Services',         tier: 'priority' },
  '722550': { label: 'Caterer',                       tier: 'priority' },
  '72254':  { label: 'Bar / Drinking Place',          tier: 'priority' },
  '722540': { label: 'Drinking Place (Bar)',           tier: 'priority' },
  '72259':  { label: 'Other Food Service',            tier: 'priority' },
  '722590': { label: 'Other Food Service',            tier: 'priority' },

  // ── 3-digit fallbacks for major groups not covered by 4+ digit entries ────
  '812':    { label: 'Personal Care / Laundry',       tier: 'priority' },
  '713':    { label: 'Amusement / Recreation',        tier: 'good' },

  // ── Personal Care / Beauty / Wellness (priority) ──────────────────────────
  '812110': { label: 'Barber Shop',                   tier: 'priority' },
  '812112': { label: 'Beauty Salon',                  tier: 'priority' },
  '812113': { label: 'Nail Salon',                    tier: 'priority' },
  '812190': { label: 'Personal Care Services',        tier: 'priority' },
  '812111': { label: 'Barber Shop',                   tier: 'priority' },
  '8121':   { label: 'Personal Care Services',        tier: 'priority' },
  '812199': { label: 'Other Personal Care',           tier: 'priority' },

  // ── Fitness & Recreation (priority) ───────────────────────────────────────
  '713940': { label: 'Fitness Center / Gym',          tier: 'priority' },
  '713950': { label: 'Bowling Center',                tier: 'priority' },
  '713990': { label: 'Amusement / Recreation',        tier: 'priority' },
  '713200': { label: 'Gambling Facility',             tier: 'good' },
  '71394':  { label: 'Fitness Center / Gym',          tier: 'priority' },
  '7139':   { label: 'Amusement / Recreation',        tier: 'priority' },
  '713910': { label: 'Golf Course',                   tier: 'good' },
  '711':    { label: 'Performing Arts / Sports',      tier: 'good' },
  '7111':   { label: 'Performing Arts',               tier: 'good' },
  '7112':   { label: 'Spectator Sports',              tier: 'good' },
  '7113':   { label: 'Promoter / Event Venue',        tier: 'good' },
  '7131':   { label: 'Amusement Parks & Arcades',     tier: 'priority' },

  // ── Retail (good–priority) ────────────────────────────────────────────────
  '441':    { label: 'Auto Dealer / Parts',           tier: 'good' },
  '4411':   { label: 'New Auto Dealer',               tier: 'good' },
  '44111':  { label: 'New Car Dealer',                tier: 'good' },
  '4413':   { label: 'Auto Parts / Accessories',      tier: 'good' },
  '442':    { label: 'Furniture & Home Furnishings',  tier: 'good' },
  '443':    { label: 'Electronics & Appliances',      tier: 'good' },
  '4431':   { label: 'Electronics Store',             tier: 'good' },
  '444':    { label: 'Building Materials / Hardware', tier: 'good' },
  '445':    { label: 'Grocery / Specialty Food',      tier: 'priority' },
  '4451':   { label: 'Grocery Store',                 tier: 'priority' },
  '4452':   { label: 'Specialty Food Store',          tier: 'priority' },
  '4453':   { label: 'Beer, Wine & Liquor Store',     tier: 'priority' },
  '44531':  { label: 'Beer, Wine & Liquor Store',     tier: 'priority' },
  '446':    { label: 'Health & Personal Care Store',  tier: 'priority' },
  '4461':   { label: 'Pharmacy / Drug Store',         tier: 'priority' },
  '447':    { label: 'Gas Station / Convenience',     tier: 'good' },
  '4471':   { label: 'Gas Station with Store',        tier: 'good' },
  '448':    { label: 'Clothing & Accessories Store',  tier: 'priority' },
  '4481':   { label: 'Clothing Store',                tier: 'priority' },
  '4482':   { label: 'Shoe Store',                    tier: 'priority' },
  '4483':   { label: 'Jewelry / Luggage',             tier: 'good' },
  '451':    { label: 'Sporting Goods / Hobby / Books',tier: 'good' },
  '452':    { label: 'General Merchandise Store',     tier: 'priority' },
  '4521':   { label: 'Department Store',              tier: 'priority' },
  '4523':   { label: 'Wholesale Club / Supercenter',  tier: 'good' },
  '453':    { label: 'Miscellaneous Retail',          tier: 'good' },
  '4531':   { label: 'Florist',                       tier: 'good' },
  '4532':   { label: 'Office Supply Store',           tier: 'good' },
  '4533':   { label: 'Used Merchandise Store',        tier: 'good' },
  '4539':   { label: 'Other Miscellaneous Retail',    tier: 'good' },
  '454':    { label: 'Non-Store Retail / Vending',    tier: 'neutral' },

  // ── Auto Repair (priority) ────────────────────────────────────────────────
  '811':    { label: 'Auto / Equipment Repair',       tier: 'priority' },
  '8111':   { label: 'Auto Repair & Maintenance',     tier: 'priority' },
  '81111':  { label: 'General Auto Repair',           tier: 'priority' },
  '811111': { label: 'General Auto Repair Shop',      tier: 'priority' },
  '811112': { label: 'Auto Glass Replacement',        tier: 'good' },
  '811113': { label: 'Transmission Repair',           tier: 'priority' },
  '811121': { label: 'Auto Body / Paint Shop',        tier: 'priority' },
  '811191': { label: 'Lube & Oil Shop',               tier: 'priority' },
  '811192': { label: 'Car Wash',                      tier: 'priority' },

  // ── Home Services (good) ──────────────────────────────────────────────────
  '2361':   { label: 'Residential Construction',      tier: 'good' },
  '2362':   { label: 'Non-Residential Construction',  tier: 'good' },
  '238':    { label: 'Specialty Trade Contractor',    tier: 'good' },
  '2381':   { label: 'Plumbing & HVAC',               tier: 'good' },
  '2382':   { label: 'Electrical Contractor',         tier: 'good' },
  '2389':   { label: 'Other Specialty Trade',         tier: 'good' },
  '561720': { label: 'Janitorial Services',           tier: 'neutral' },
  '561730': { label: 'Landscaping Services',          tier: 'good' },
  '561790': { label: 'Home Services',                 tier: 'good' },

  // ── Accommodation (good) ──────────────────────────────────────────────────
  '721':    { label: 'Accommodation',                 tier: 'good' },
  '7211':   { label: 'Hotel / Motel',                 tier: 'good' },
  '721110': { label: 'Hotel & Motel',                 tier: 'good' },
  '7212':   { label: 'RV Park / Recreation Camp',     tier: 'neutral' },
  '7213':   { label: 'Rooming & Boarding House',      tier: 'neutral' },

  // ── Health Care — Low/neutral (direct billing, not usually card-heavy) ────
  '621':    { label: 'Health Care / Social Assistance', tier: 'neutral' },
  '6211':   { label: 'Office of Physician',           tier: 'neutral' },
  '6212':   { label: 'Dentist Office',                tier: 'neutral' },
  '6213':   { label: 'Other Health Practitioner',     tier: 'neutral' },
  '6214':   { label: 'Outpatient Care Center',        tier: 'neutral' },
  '6215':   { label: 'Medical / Diagnostic Lab',      tier: 'low' },
  '623':    { label: 'Nursing / Residential Care',    tier: 'low' },

  // ── Education (low) ───────────────────────────────────────────────────────
  '611':    { label: 'Educational Services',          tier: 'neutral' },
  '611110': { label: 'Elementary / Secondary School', tier: 'low' },
  '611691': { label: 'Exam Prep / Tutoring',          tier: 'neutral' },
  '611620': { label: 'Sports / Recreation Instruction', tier: 'good' },

  // ── Professional Services (low) ───────────────────────────────────────────
  '541':    { label: 'Professional Services',         tier: 'low' },
  '5411':   { label: 'Legal Services',                tier: 'low' },
  '5412':   { label: 'Accounting / Bookkeeping',      tier: 'low' },
  '5413':   { label: 'Architecture / Engineering',    tier: 'low' },
  '5414':   { label: 'Specialized Design Services',   tier: 'neutral' },
  '5415':   { label: 'Computer / IT Services',        tier: 'low' },
  '5416':   { label: 'Management Consulting',         tier: 'low' },
  '5417':   { label: 'Scientific Research',           tier: 'low' },
  '5418':   { label: 'Advertising / Marketing',       tier: 'neutral' },
  '5419':   { label: 'Other Professional Services',   tier: 'low' },

  // ── Administrative & Support (low) ────────────────────────────────────────
  '561':    { label: 'Administrative / Support',      tier: 'low' },
  '5611':   { label: 'Office Admin Services',         tier: 'low' },
  '5614':   { label: 'Business Support Services',     tier: 'low' },
  '5616':   { label: 'Investigation / Security',      tier: 'low' },
  '5617':   { label: 'Building Services',             tier: 'neutral' },

  // ── Finance / Insurance / Real Estate (skip) ──────────────────────────────
  '52':     { label: 'Finance & Insurance',           tier: 'skip' },
  '521':    { label: 'Monetary Authorities',          tier: 'skip' },
  '522':    { label: 'Credit Intermediation',         tier: 'skip' },
  '523':    { label: 'Securities / Investments',      tier: 'skip' },
  '524':    { label: 'Insurance Carrier',             tier: 'skip' },
  '525':    { label: 'Funds / Trusts / Vehicles',     tier: 'skip' },
  '531':    { label: 'Real Estate',                   tier: 'skip' },
  '5311':   { label: 'Lessors of Real Estate',        tier: 'skip' },
  '5312':   { label: 'Real Estate Agents',            tier: 'skip' },
  '5313':   { label: 'Activities Related to RE',      tier: 'skip' },
  '532':    { label: 'Rental & Leasing',              tier: 'low' },
  '533':    { label: 'Lessors of Nonfinancial Assets', tier: 'skip' },

  // ── Holding Companies / Management (skip) ────────────────────────────────
  '551':    { label: 'Management of Companies',       tier: 'skip' },
  '5511':   { label: 'Holding Company / HQ',          tier: 'skip' },

  // ── Wholesale (low) ───────────────────────────────────────────────────────
  '42':     { label: 'Wholesale Trade',               tier: 'low' },
  '423':    { label: 'Durable Goods Wholesale',       tier: 'low' },
  '424':    { label: 'Nondurable Goods Wholesale',    tier: 'low' },

  // ── Manufacturing (low-neutral) ───────────────────────────────────────────
  '31':     { label: 'Manufacturing',                 tier: 'low' },
  '32':     { label: 'Manufacturing',                 tier: 'low' },
  '33':     { label: 'Manufacturing',                 tier: 'low' },

  // ── Transportation / Warehousing (low) ────────────────────────────────────
  '48':     { label: 'Transportation',                tier: 'low' },
  '49':     { label: 'Warehousing',                   tier: 'low' },

  // ── Utilities (skip) ──────────────────────────────────────────────────────
  '22':     { label: 'Utilities',                     tier: 'skip' },

  // ── Agriculture (skip/neutral) ────────────────────────────────────────────
  '11':     { label: 'Agriculture / Forestry / Fishing', tier: 'skip' },

  // ── Mining / Oil & Gas (skip) ─────────────────────────────────────────────
  '21':     { label: 'Mining / Oil & Gas',            tier: 'skip' },
}

/**
 * Resolve a NAICS code to its best matching category.
 * Tries 6-digit → 5-digit → 4-digit → 3-digit → 2-digit.
 */
export function resolveNaics(code: string | null | undefined): NaicsCategory {
  if (!code) return { label: 'Unknown Category', tier: 'neutral' }
  const c = code.trim().replace(/\D/g, '')

  for (let len = Math.min(c.length, 6); len >= 2; len--) {
    const prefix = c.slice(0, len)
    if (NAICS_MAP[prefix]) return NAICS_MAP[prefix]
  }
  return { label: `NAICS ${c}`, tier: 'neutral' }
}

/** Return the tier-based score modifier (positive or negative) */
export function naicsScoreModifier(code: string | null | undefined): number {
  const { tier } = resolveNaics(code)
  switch (tier) {
    case 'priority': return 15
    case 'good':     return 8
    case 'neutral':  return 0
    case 'low':      return -8
    case 'skip':     return -20
  }
}

/** Human-readable label for a NAICS code */
export function naicsLabel(code: string | null | undefined): string {
  return resolveNaics(code).label
}

/** Should this lead be deprioritized based on NAICS? */
export function naicsIsSkip(code: string | null | undefined): boolean {
  return resolveNaics(code).tier === 'skip'
}

export const NAICS_TIER_COLORS: Record<NaicsTier, string> = {
  priority: 'bg-green-50 text-green-700 border-green-200',
  good:     'bg-blue-50 text-blue-700 border-blue-200',
  neutral:  'bg-gray-50 text-gray-600 border-gray-200',
  low:      'bg-yellow-50 text-yellow-700 border-yellow-200',
  skip:     'bg-red-50 text-red-500 border-red-200',
}
