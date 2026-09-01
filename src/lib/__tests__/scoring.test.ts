import { describe, it, expect } from 'vitest'
import { scoreLead } from '../scoring'

const NOW = new Date('2026-09-01T12:00:00Z')

describe('scoreLead — timing signals', () => {
  it('starts at 35', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(35)
  })

  it('+20 for permit issued today', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: '2026-09-01', firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(55)
  })

  it('+15 for permit issued 5 days ago', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: '2026-08-27', firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(50)
  })

  it('+8 for permit issued 10 days ago', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: '2026-08-22', firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(43)
  })

  it('+20 for future first sales date', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: null, firstSalesDate: '2026-09-10', businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(55)
    expect(r.reasons.some(r => r.includes('Opening soon'))).toBe(true)
  })

  it('+12 for first sales 7 days ago', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: null, firstSalesDate: '2026-08-25', businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(47)
  })

  it('+6 for first sales 20 days ago (within 30 days)', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: null, firstSalesDate: '2026-08-12', businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(41)
  })

  it('no timing bonus for permit issued 20 days ago', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: '2026-08-12', firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(35) // no bonus beyond 14 days
  })
})

describe('scoreLead — NAICS signals', () => {
  it('+20 for restaurant NAICS 722', () => {
    const r = scoreLead({ naicsCode: '722511', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(55)
    expect(r.reasons.some(r => r.includes('722'))).toBe(true)
  })

  it('+18 for salon NAICS 8121', () => {
    const r = scoreLead({ naicsCode: '812112', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(53)
  })

  it('+20 for dental NAICS 6212', () => {
    const r = scoreLead({ naicsCode: '621210', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(55)
  })

  it('-20 for real estate NAICS 531', () => {
    const r = scoreLead({ naicsCode: '531110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(15)
  })

  it('+18 for automotive repair NAICS 8111', () => {
    const r = scoreLead({ naicsCode: '811110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(53)
  })

  it('+18 for fitness/recreation NAICS 71394', () => {
    const r = scoreLead({ naicsCode: '713940', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(53)
  })

  it('+14 for healthcare practitioner NAICS 6213', () => {
    const r = scoreLead({ naicsCode: '621310', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(49)
  })

  it('+18 for outpatient care NAICS 6214', () => {
    const r = scoreLead({ naicsCode: '621410', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(53)
  })

  it('+12 for retail NAICS 445 (grocery)', () => {
    const r = scoreLead({ naicsCode: '445110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(47)
  })

  it('+12 for retail NAICS 449 (furniture)', () => {
    const r = scoreLead({ naicsCode: '449110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(47)
  })

  it('+12 for retail NAICS 455 (general merchandise)', () => {
    const r = scoreLead({ naicsCode: '455110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(47)
  })

  it('+8 for specialty contractor NAICS 238', () => {
    const r = scoreLead({ naicsCode: '238110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(43)
  })

  it('-20 for financial entity NAICS 523', () => {
    const r = scoreLead({ naicsCode: '523110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(15)
  })

  it('-20 for financial entity NAICS 525', () => {
    const r = scoreLead({ naicsCode: '525110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(15)
  })

  it('-35 for holding company NAICS 551', () => {
    const r = scoreLead({ naicsCode: '551112', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(0)
  })

  it('-40 for government NAICS 92', () => {
    const r = scoreLead({ naicsCode: '921110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(0)
  })
})

describe('scoreLead — negative signals', () => {
  it('-15 for PO Box address', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: 'PO Box 1234', taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(20)
  })

  it('-15 for "holdings" in name', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: null, firstSalesDate: null, businessName: 'Acme Holdings LLC', outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(20)
  })

  it('-25 for "management company" in name', () => {
    const r = scoreLead({ naicsCode: null, permitIssueDate: null, firstSalesDate: null, businessName: 'Acme Management Company', outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(10)
  })
})

describe('scoreLead — priority brackets', () => {
  it('score 75+ is hot', () => {
    const r = scoreLead({ naicsCode: '722511', permitIssueDate: '2026-09-01', firstSalesDate: '2026-09-10', businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBeGreaterThanOrEqual(75)
    expect(r.priority).toBe('hot')
  })

  it('score 0 is clamped, not negative', () => {
    const r = scoreLead({ naicsCode: '92', permitIssueDate: null, firstSalesDate: null, businessName: 'School District ISD', outletAddress: 'PO Box 1', taxpayerOrganizationType: 'Government' }, NOW)
    expect(r.score).toBe(0)
    expect(r.priority).toBe('skip')
  })

  it('score 100 is clamped, not over 100', () => {
    const r = scoreLead({ naicsCode: '722511', permitIssueDate: '2026-09-01', firstSalesDate: '2026-09-10', businessName: 'Good Tacos', outletAddress: '123 Main St', taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBeLessThanOrEqual(100)
  })
})
