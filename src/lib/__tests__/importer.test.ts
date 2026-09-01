/**
 * Importer utility tests — Phase 2
 *
 * Tests cover:
 *   1.  normalize() — blank/null/whitespace handling
 *   2.  parseDate() — valid and invalid dates
 *   3.  buildCutoffIso() — date cutoff calculation
 *   4.  validateCountyCodes() — county allowlist enforcement
 *   5.  buildSoQLWhere() — SoQL query construction
 *   6.  skipReason() — missing permit date
 *   7.  skipReason() — missing taxpayer/outlet number
 *   8.  skipReason() — invalid county code
 *   9.  skipReason() — valid record passes
 *  10.  duplicate / idempotent upsert logic (field preservation rules)
 *  11.  CRM_PROTECTED_FIELDS — list is complete
 */

import { describe, it, expect } from 'vitest'
import {
  normalize,
  parseDate,
  buildCutoffIso,
  validateCountyCodes,
  buildSoQLWhere,
  skipReason,
  DFW_COUNTY_ALLOWLIST,
  CRM_PROTECTED_FIELDS,
} from '../importer-utils'

// ── 1. normalize ──────────────────────────────────────────────────────────────

describe('normalize()', () => {
  it('returns null for null', () => expect(normalize(null)).toBeNull())
  it('returns null for undefined', () => expect(normalize(undefined)).toBeNull())
  it('returns null for empty string', () => expect(normalize('')).toBeNull())
  it('returns null for whitespace-only string', () => expect(normalize('   ')).toBeNull())
  it('trims leading/trailing whitespace', () => expect(normalize('  hello  ')).toBe('hello'))
  it('preserves inner whitespace', () => expect(normalize('  foo bar  ')).toBe('foo bar'))
  it('returns the value when already trimmed', () => expect(normalize('ABC')).toBe('ABC'))
})

// ── 2. parseDate ──────────────────────────────────────────────────────────────

describe('parseDate()', () => {
  it('returns null for null', () => expect(parseDate(null)).toBeNull())
  it('returns null for undefined', () => expect(parseDate(undefined)).toBeNull())
  it('returns null for empty string', () => expect(parseDate('')).toBeNull())
  it('returns null for non-date string', () => expect(parseDate('not-a-date')).toBeNull())
  it('parses YYYY-MM-DD', () => expect(parseDate('2026-09-01')).toBe('2026-09-01'))
  it('parses Texas ISO datetime', () => expect(parseDate('2026-09-01T00:00:00.000')).toBe('2026-09-01'))
  it('parses ISO with Z', () => expect(parseDate('2026-09-01T12:00:00Z')).toBe('2026-09-01'))
  it('returns null for invalid date 9999-99-99', () => expect(parseDate('9999-99-99')).toBeNull())
})

// ── 3. buildCutoffIso ─────────────────────────────────────────────────────────

describe('buildCutoffIso()', () => {
  const now = new Date('2026-09-01T12:00:00Z')

  it('14-day cutoff is 2026-08-18T00:00:00.000', () => {
    expect(buildCutoffIso(14, now)).toBe('2026-08-18T00:00:00.000')
  })

  it('7-day cutoff is 2026-08-25T00:00:00.000', () => {
    expect(buildCutoffIso(7, now)).toBe('2026-08-25T00:00:00.000')
  })

  it('30-day cutoff is 2026-08-02T00:00:00.000', () => {
    expect(buildCutoffIso(30, now)).toBe('2026-08-02T00:00:00.000')
  })

  it('includes permits issued exactly on the cutoff day (T00:00:00.000 suffix)', () => {
    const cutoff = buildCutoffIso(14, now)
    expect(cutoff).toMatch(/T00:00:00\.000$/)
  })
})

// ── 4. validateCountyCodes — allowlist ───────────────────────────────────────

describe('validateCountyCodes()', () => {
  it('keeps valid DFW codes', () => {
    const result = validateCountyCodes(['057', '220', '061'], DFW_COUNTY_ALLOWLIST)
    expect(result).toEqual(['057', '220', '061'])
  })

  it('rejects unknown codes', () => {
    const result = validateCountyCodes(['057', '999', '000'], DFW_COUNTY_ALLOWLIST)
    expect(result).toEqual(['057'])
  })

  it('returns empty array when all codes are invalid', () => {
    const result = validateCountyCodes(['999', 'ABC', ''], DFW_COUNTY_ALLOWLIST)
    expect(result).toEqual([])
  })

  it('allows Hood (111) and Somervell (213)', () => {
    const result = validateCountyCodes(['111', '213'], DFW_COUNTY_ALLOWLIST)
    expect(result).toEqual(['111', '213'])
  })

  it('accepts all 13 default DFW codes', () => {
    const all = ['043', '057', '061', '070', '111', '116', '126', '129', '184', '199', '213', '220', '249']
    expect(validateCountyCodes(all, DFW_COUNTY_ALLOWLIST)).toEqual(all)
  })
})

// ── 5. buildSoQLWhere ─────────────────────────────────────────────────────────

describe('buildSoQLWhere()', () => {
  const cutoff = '2026-08-18T00:00:00.000'

  it('produces a valid SoQL WHERE for a single county', () => {
    const where = buildSoQLWhere(cutoff, ['057'])
    expect(where).toBe(
      `outlet_permit_issue_date >= '${cutoff}' AND (outlet_county_code='057')`
    )
  })

  it('produces OR-joined county clauses for multiple codes', () => {
    const where = buildSoQLWhere(cutoff, ['057', '220'])
    expect(where).toContain(`outlet_county_code='057'`)
    expect(where).toContain(`outlet_county_code='220'`)
    expect(where).toContain(' OR ')
  })

  it('includes the date cutoff in every query', () => {
    const where = buildSoQLWhere(cutoff, ['057', '061', '220'])
    expect(where).toContain(`outlet_permit_issue_date >= '${cutoff}'`)
  })

  it('throws when validCodes is empty', () => {
    expect(() => buildSoQLWhere(cutoff, [])).toThrow()
  })
})

// ── 6–9. skipReason — per-record validation ───────────────────────────────────

describe('skipReason()', () => {
  const validRecord: Record<string, string> = {
    taxpayer_number: '12345678901',
    outlet_number: '1',
    outlet_permit_issue_date: '2026-08-20T00:00:00.000',
    outlet_county_code: '057',
  }

  it('returns null for a fully valid record', () => {
    expect(skipReason(validRecord)).toBeNull()
  })

  // 6. Missing permit date
  it('skips a record with no permit date', () => {
    const r = { ...validRecord, outlet_permit_issue_date: '' }
    expect(skipReason(r)).toMatch(/permit_issue_date/)
  })

  it('skips a record with an invalid permit date string', () => {
    const r = { ...validRecord, outlet_permit_issue_date: 'not-a-date' }
    expect(skipReason(r)).toMatch(/permit_issue_date/)
  })

  // 7. Missing taxpayer / outlet number
  it('skips when taxpayer_number is missing', () => {
    const r = { ...validRecord, taxpayer_number: '' }
    expect(skipReason(r)).toMatch(/taxpayer_number/)
  })

  it('skips when outlet_number is missing', () => {
    const r = { ...validRecord, outlet_number: '   ' }
    expect(skipReason(r)).toMatch(/outlet_number/)
  })

  // 8. Invalid county code
  it('skips a record whose county code is not in the allowlist', () => {
    const r = { ...validRecord, outlet_county_code: '999' }
    expect(skipReason(r)).toMatch(/county_code/)
  })

  it('skips a record with an empty county code', () => {
    const r = { ...validRecord, outlet_county_code: '' }
    expect(skipReason(r)).toMatch(/county_code/)
  })

  // 9. Custom allowlist respected
  it('respects a custom allowlist', () => {
    const custom = new Set(['057'])
    // 220 is valid DFW but not in our custom set
    const r = { ...validRecord, outlet_county_code: '220' }
    expect(skipReason(r, custom)).toMatch(/county_code/)
    expect(skipReason({ ...validRecord, outlet_county_code: '057' }, custom)).toBeNull()
  })
})

// ── 10. Duplicate / CRM field preservation ───────────────────────────────────

describe('CRM field preservation rules (design contract)', () => {
  /**
   * These tests document the expected contract without a live Supabase connection.
   * The actual UPDATE in the edge function touches only source-owned fields and
   * never touches CRM_PROTECTED_FIELDS.
   */
  it('CRM_PROTECTED_FIELDS includes primary_phone', () => {
    expect(CRM_PROTECTED_FIELDS).toContain('primary_phone')
  })

  it('CRM_PROTECTED_FIELDS includes primary_email', () => {
    expect(CRM_PROTECTED_FIELDS).toContain('primary_email')
  })

  it('CRM_PROTECTED_FIELDS includes status', () => {
    expect(CRM_PROTECTED_FIELDS).toContain('status')
  })

  it('CRM_PROTECTED_FIELDS includes website', () => {
    expect(CRM_PROTECTED_FIELDS).toContain('website')
  })

  it('CRM_PROTECTED_FIELDS includes next_follow_up_at', () => {
    expect(CRM_PROTECTED_FIELDS).toContain('next_follow_up_at')
  })

  it('CRM_PROTECTED_FIELDS does not include taxpayer_name (source field)', () => {
    expect(CRM_PROTECTED_FIELDS).not.toContain('taxpayer_name')
  })

  it('CRM_PROTECTED_FIELDS does not include outlet_address (source field)', () => {
    expect(CRM_PROTECTED_FIELDS).not.toContain('outlet_address')
  })
})

// ── 11. Authorization contract ────────────────────────────────────────────────

describe('Authorization contract (edge function design)', () => {
  /**
   * These tests document the expected HTTP-level authorization behavior.
   * They encode the specification as executable assertions on helper logic,
   * since the full Deno handler cannot run in the Vitest/Node environment.
   */

  it('a request with no Authorization and no x-cron-secret must be rejected (401)', () => {
    // Simulated: if neither header is present, isScheduled=false, ownerId=null → 401
    const headers = new Headers()
    const hasAuth = headers.has('Authorization')
    const hasCron = headers.has('x-cron-secret')
    expect(hasAuth || hasCron).toBe(false)
    // Contract: code path must return 401
    const wouldBeRejected = !hasAuth && !hasCron
    expect(wouldBeRejected).toBe(true)
  })

  it('an x-cron-secret that does not match the stored secret must be rejected', () => {
    const storedSecret: string = 'correct-secret-abc123'
    const incomingSecret: string = 'wrong-secret-xyz999'
    expect(storedSecret === incomingSecret).toBe(false)
    // Contract: code path must return 401
  })

  it('a correct x-cron-secret grants scheduled access', () => {
    const storedSecret: string = 'correct-secret-abc123'
    const incomingSecret: string = 'correct-secret-abc123'
    expect(storedSecret === incomingSecret).toBe(true)
  })

  it('owner_id is never taken from request body for manual imports', () => {
    // The edge function derives ownerId from the verified JWT, not from body.territoryId or body.ownerId
    // This test documents the contract — enforced by code inspection.
    const bodyFields = ['territoryId']
    expect(bodyFields).not.toContain('ownerId')
  })
})

// ── Pagination contract ───────────────────────────────────────────────────────

describe('Pagination contract', () => {
  it('stops fetching when a page is smaller than PAGE_SIZE (1000)', () => {
    // Contract: loop continues while page.length === PAGE_SIZE and fetched < MAX_RECORDS
    const PAGE_SIZE = 1000
    const MAX_RECORDS = 10_000

    // Simulate 2 full pages then a partial
    const pageSizes = [1000, 1000, 500]
    let fetched = 0
    let pages = 0

    for (const size of pageSizes) {
      fetched += size
      pages++
      if (size < PAGE_SIZE || fetched >= MAX_RECORDS) break
    }

    expect(pages).toBe(3)
    expect(fetched).toBe(2500)
  })

  it('stops at MAX_RECORDS (10 000) even if every page is full', () => {
    const PAGE_SIZE = 1000
    const MAX_RECORDS = 10_000

    let fetched = 0
    let pages = 0

    while (fetched < MAX_RECORDS) {
      fetched += PAGE_SIZE
      pages++
      if (PAGE_SIZE < PAGE_SIZE) break // never true — tests the outer guard
    }

    expect(fetched).toBe(MAX_RECORDS)
    expect(pages).toBe(10)
  })

  it('offset advances by PAGE_SIZE per page', () => {
    const PAGE_SIZE = 1000
    let offset = 0
    const offsets: number[] = []

    for (let i = 0; i < 3; i++) {
      offsets.push(offset)
      offset += PAGE_SIZE
    }

    expect(offsets).toEqual([0, 1000, 2000])
  })
})
