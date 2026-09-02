/**
 * Texas Comptroller CPA API client.
 * Documentation: https://api-doc.comptroller.texas.gov/
 *
 * Requires CPA_API_KEY environment variable.
 * Free registration: https://comptroller.texas.gov/transparency/open-data/
 *
 * Endpoints used:
 *   GET /public-data/v1/public/sales-tax-payer/{id}
 *   GET /public-data/v1/public/franchise-tax/{id}
 *   GET /public-data/v1/public/franchise-tax-list
 */

const CPA_API_BASE = 'https://api.comptroller.texas.gov/public-data/v1/public'

function cpaApiKey(): string {
  const key = process.env.CPA_API_KEY
  if (!key) throw new Error('CPA_API_KEY environment variable is not set')
  return key
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CpaSalesTaxPayer {
  TAXPAYER_ID: string
  FEI_NUMBER?: string
  BUSINESS_NAME?: string
  STREET?: string
  CITY?: string
  STATE?: string
  ZIPCODE?: string
  FIRST_NAME?: string
  MIDDLE_NAME?: string
  LAST_NAME?: string
  NAME_PREFIX?: string
  NAME_SUFFIX?: string
  STATUS?: string
}

export interface CpaLocation {
  TAXPAYER_ID: string
  LOCATION_NAME: string
  LOCATION_NUMBER: string
  STREET: string
  CITY: string
  STATE: string
  ZIPCODE: string
  PERMIT_START_DT: string
  PERMIT_END_DT?: string
  STATUS: string
}

export interface CpaOfficer {
  AGNT_NM: string         // Officer/Director name
  AGNT_TITL_TX: string    // Title (PRESIDENT, MANAGER, MEMBER, etc.)
  AGNT_ACTV_YR: string    // Year active
  AD_STR_POB_TX?: string  // Street address
  CITY_NM?: string
  ST_CD?: string
  AD_ZP?: string
  SOURCE?: string         // 'SOS' — Secretary of State
}

export interface CpaFranchiseTax {
  taxpayerId: string
  feiNumber?: string
  name?: string
  dbaName?: string
  mailingAddressStreet?: string
  mailingAddressCity?: string
  mailingAddressState?: string
  mailingAddressZip?: string
  mailingAddressZip4?: string
  rightToTransactTX?: string
  stateOfFormation?: string
  sosRegistrationStatus?: string
  effectiveSosRegistrationDate?: string
  sosFileNumber?: string
  registeredAgentName?: string
  registeredOfficeAddressStreet?: string
  registeredOfficeAddressCity?: string
  registeredOfficeAddressState?: string
  registeredOfficeAddressZip?: string
  taxId?: string
  lastUpdated?: string
  reportYear?: string
  officerInfo?: CpaOfficer[]
}

export interface CpaFtasSummary {
  taxpayerId: string
  name?: string
  fileNumber?: string
}

// ── Known commercial registered agent companies ───────────────────────────────
// These are not business owners and should never be shown as sales contacts.
const COMMERCIAL_RA_NAMES = new Set([
  'CT CORPORATION SYSTEM',
  'CORPORATION SERVICE COMPANY',
  'INCORP SERVICES',
  'NATIONAL REGISTERED AGENTS',
  'NORTHWEST REGISTERED AGENT',
  'REGISTERED AGENTS INC',
  'AGENT SOLUTIONS',
  'CAPITOL CORPORATE SERVICES',
  'WOLTERS KLUWER',
  'PARACORP',
  'COGENCY GLOBAL',
  'UNITED AGENT GROUP',
  'LEGALINC CORPORATE SERVICES',
  'COMPANY FORMATIONS',
  'VCORP SERVICES',
  'HARBOR COMPLIANCE',
  'ZEN BUSINESS',
])

export function isCommercialAgent(name: string | null | undefined): boolean {
  if (!name) return false
  const upper = name.toUpperCase().trim()
  return COMMERCIAL_RA_NAMES.has(upper) ||
    /\b(REGISTERED AGENT|RA SERVICE|CORP SERVICE|AGENT SERVICE)\b/.test(upper)
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** Fetch sales tax payer record by 11-digit taxpayer ID */
export async function fetchSalesTaxPayer(taxpayerId: string): Promise<CpaSalesTaxPayer | null> {
  const id = taxpayerId.trim().padStart(11, '0')
  try {
    const res = await fetch(`${CPA_API_BASE}/sales-tax-payer/${id}`, {
      headers: { 'x-api-key': cpaApiKey() },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`CPA API ${res.status}: ${body}`)
    }
    const json = await res.json()
    return json.data as CpaSalesTaxPayer
  } catch (e) {
    if (e instanceof Error && e.message.includes('CPA_API_KEY')) throw e
    console.warn('[cpa-api] fetchSalesTaxPayer error:', e)
    return null
  }
}

/** Fetch franchise-tax record (includes officers) by 11-digit taxpayer ID */
export async function fetchFranchiseTax(taxpayerId: string): Promise<CpaFranchiseTax | null> {
  const id = taxpayerId.trim().padStart(11, '0')
  try {
    const res = await fetch(`${CPA_API_BASE}/franchise-tax/${id}`, {
      headers: { 'x-api-key': cpaApiKey() },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`CPA API ${res.status}: ${body}`)
    }
    const json = await res.json()
    return json.data as CpaFranchiseTax
  } catch (e) {
    if (e instanceof Error && e.message.includes('CPA_API_KEY')) throw e
    console.warn('[cpa-api] fetchFranchiseTax error:', e)
    return null
  }
}

/** Search FTAS list by taxpayer ID or name (returns brief summaries) */
export async function searchFtas(query: { taxpayerId?: string; name?: string; fileNumber?: string }): Promise<CpaFtasSummary[]> {
  const params = new URLSearchParams()
  if (query.taxpayerId) params.set('taxpayerId', query.taxpayerId)
  if (query.name)       params.set('name', query.name)
  if (query.fileNumber) params.set('fileNumber', query.fileNumber)

  try {
    const res = await fetch(`${CPA_API_BASE}/franchise-tax-list?${params}`, {
      headers: { 'x-api-key': cpaApiKey() },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []) as CpaFtasSummary[]
  } catch {
    return []
  }
}

// ── Decision-maker extraction helpers ─────────────────────────────────────────

export type PersonRole = 'sole_proprietor' | 'officer' | 'registered_agent' | 'unknown'

export interface ExtractedPerson {
  name: string
  title: string
  role: PersonRole
  sourceNote: string    // plain-text attribution shown in UI
  confidence: number    // 0-100
}

/**
 * Extract the most likely decision-maker from a franchise-tax record.
 * Follows the rules: officers first, exclude organizers and commercial RAs.
 */
export function extractDecisionMaker(
  franchise: CpaFranchiseTax | null,
  salesTaxPayer: CpaSalesTaxPayer | null,
): ExtractedPerson | null {
  // Sole proprietor — individual name on file with comptroller
  if (salesTaxPayer?.FIRST_NAME && salesTaxPayer?.LAST_NAME) {
    const name = [salesTaxPayer.NAME_PREFIX, salesTaxPayer.FIRST_NAME, salesTaxPayer.MIDDLE_NAME, salesTaxPayer.LAST_NAME, salesTaxPayer.NAME_SUFFIX]
      .filter(Boolean).join(' ')
    return {
      name,
      title: 'Sole Proprietor',
      role: 'sole_proprietor',
      sourceNote: 'Texas Comptroller sales-tax-payer record',
      confidence: 80,
    }
  }

  if (!franchise) return null

  const officers = franchise.officerInfo ?? []

  // Preferred titles (member/manager/officer — actual decision-makers)
  const preferred = officers.filter(o =>
    /\b(PRESIDENT|OWNER|MANAGER|MEMBER|DIRECTOR|OFFICER|VP|VICE PRES|TREASURER|SECRETARY)\b/i.test(o.AGNT_TITL_TX ?? '')
    && o.AGNT_NM
  )

  // Exclude titles that indicate the organizer role only
  const nonOrganizer = preferred.filter(o =>
    !/\b(ORGANIZER)\b/i.test(o.AGNT_TITL_TX ?? '')
  )

  const best = nonOrganizer[0] ?? preferred[0] ?? officers[0]
  if (!best?.AGNT_NM) return null

  // Check if the registered agent is a commercial RA
  const raIsCommercial = isCommercialAgent(franchise.registeredAgentName)

  // If the only officer IS the registered agent and they're commercial → skip
  if (
    best.AGNT_NM.toUpperCase() === (franchise.registeredAgentName ?? '').toUpperCase() &&
    raIsCommercial
  ) {
    return null
  }

  const sosUrl = franchise.sosFileNumber
    ? `https://mycpa.cpa.state.tx.us/coa/cosSearch.do` // public search — link to results
    : undefined

  const titleLower = (best.AGNT_TITL_TX ?? 'Officer').toLowerCase()
  const isOrganizer = /organizer/.test(titleLower)
  const note = isOrganizer
    ? 'Organizer (formation role only) — may not be current owner or manager. Source: Texas Secretary of State via CPA franchise-tax record.'
    : `Source: Texas Secretary of State via CPA franchise-tax record (Report Year ${franchise.reportYear ?? 'N/A'}).`

  return {
    name: best.AGNT_NM,
    title: best.AGNT_TITL_TX ?? 'Officer',
    role: 'officer',
    sourceNote: (sosUrl ? `${note} Public record: ${sosUrl}` : note),
    confidence: isOrganizer ? 40 : 65,
  }
}

/** Build the public SOS search URL for a given entity file number */
export function sosDirectSearchUrl(sosFileNumber: string | null | undefined): string | null {
  if (!sosFileNumber) return null
  // Texas SOS public search (no login required for basic lookup)
  return `https://mycpa.cpa.state.tx.us/coa/cosSearch.do`
}

/** Build the CPA taxpayer record URL */
export function cpaTaxpayerUrl(taxpayerId: string | null | undefined): string | null {
  if (!taxpayerId) return null
  return `https://mycpa.cpa.state.tx.us/coa/cosSearch.do`
}
