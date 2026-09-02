import { describe, it, expect } from 'vitest'
import { scoreLead } from '../scoring'
import { detectChain } from '../chains'

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
  // priority tier = +15 modifier
  it('+15 for restaurant NAICS 722511 (priority)', () => {
    const r = scoreLead({ naicsCode: '722511', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(50)
    expect(r.reasons.some(r => r.includes('722'))).toBe(true)
  })

  it('+15 for salon NAICS 812112 (priority)', () => {
    const r = scoreLead({ naicsCode: '812112', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(50)
  })

  it('0 for dental NAICS 621210 (neutral)', () => {
    const r = scoreLead({ naicsCode: '621210', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(35)
  })

  it('skip for real estate NAICS 531 (-20)', () => {
    const r = scoreLead({ naicsCode: '531110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(15)
  })

  it('+15 for automotive repair NAICS 811110 (priority)', () => {
    const r = scoreLead({ naicsCode: '811110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(50)
  })

  it('+15 for fitness/recreation NAICS 713940 (priority)', () => {
    const r = scoreLead({ naicsCode: '713940', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(50)
  })

  it('0 for healthcare practitioner NAICS 621310 (neutral)', () => {
    const r = scoreLead({ naicsCode: '621310', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(35)
  })

  it('0 for outpatient care NAICS 621410 (neutral)', () => {
    const r = scoreLead({ naicsCode: '621410', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(35)
  })

  it('+15 for grocery store NAICS 445110 (priority)', () => {
    const r = scoreLead({ naicsCode: '445110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(50)
  })

  it('0 for furniture retail NAICS 449110 (neutral)', () => {
    const r = scoreLead({ naicsCode: '449110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(35)
  })

  it('0 for general merchandise NAICS 455110 (neutral)', () => {
    const r = scoreLead({ naicsCode: '455110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(35)
  })

  it('+8 for specialty contractor NAICS 238', () => {
    const r = scoreLead({ naicsCode: '238110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(43)
  })

  it('skip for financial entity NAICS 523 (-20)', () => {
    const r = scoreLead({ naicsCode: '523110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(15)
  })

  it('skip for financial entity NAICS 525 (-20)', () => {
    const r = scoreLead({ naicsCode: '525110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(15)
  })

  it('skip for holding company NAICS 551 (-20)', () => {
    const r = scoreLead({ naicsCode: '551112', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(15)
  })

  it('-40 for government NAICS 92 override', () => {
    const r = scoreLead({ naicsCode: '921110', permitIssueDate: null, firstSalesDate: null, businessName: null, outletAddress: null, taxpayerOrganizationType: null }, NOW)
    expect(r.score).toBe(0)
  })
})

describe('detectChain — corporate chain detection', () => {
  it('detects Chipotle by outlet name', () => {
    const r = detectChain('CHIPOTLE MEXICAN GRILL #6249', null)
    expect(r.isChain).toBe(true)
    expect(r.chainName).toBe('Chipotle Mexican Grill')
  })

  it('detects McDonald\'s by taxpayer name', () => {
    const r = detectChain(null, 'MCDONALDS CORPORATION USA LLC')
    expect(r.isChain).toBe(true)
    expect(r.chainName).toBe("McDonald's")
  })

  it('detects Starbucks', () => {
    const r = detectChain('STARBUCKS #12345', null)
    expect(r.isChain).toBe(true)
    expect(r.chainName).toBe('Starbucks')
  })

  it('does not flag independent businesses', () => {
    const r = detectChain('SHADY\'S TACOS', 'CCBC BEVERAGE LLC')
    expect(r.isChain).toBe(false)
    expect(r.chainName).toBeNull()
  })

  it('does not flag null names', () => {
    const r = detectChain(null, null)
    expect(r.isChain).toBe(false)
  })
})

describe('scoreLead — chain detection', () => {
  it('subtracts 40 points for Chipotle and caps at good (never hot)', () => {
    // Chipotle with fresh permit would normally score high — chain penalty applies
    const r = scoreLead({
      naicsCode: '722511',
      permitIssueDate: '2026-09-01',
      firstSalesDate: '2026-09-10',
      businessName: 'CHIPOTLE MEXICAN GRILL #6249',
      outletName: 'CHIPOTLE MEXICAN GRILL #6249',
      taxpayerName: 'CHIPOTLE MEXICAN GRILL, INC',
      outletAddress: '123 Fake St',
      taxpayerOrganizationType: null,
    }, NOW)
    expect(r.category).toBe('corporate_chain')
    expect(r.detectedChain).toBe('Chipotle Mexican Grill')
    expect(r.priority).not.toBe('hot')  // never hot for chains
    expect(r.reasons.some(r => r.toLowerCase().includes('chain') || r.toLowerCase().includes('centrally'))).toBe(true)
  })

  it('does not flag an independent restaurant', () => {
    const r = scoreLead({
      naicsCode: '722511',
      permitIssueDate: '2026-09-01',
      firstSalesDate: null,
      businessName: "SHADY'S",
      outletName: "SHADY'S",
      taxpayerName: 'CCBC BEVERAGE LLC',
      outletAddress: '456 Main St',
      taxpayerOrganizationType: null,
    }, NOW)
    expect(r.category).toBeNull()
    expect(r.detectedChain).toBeNull()
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
