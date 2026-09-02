/**
 * Tests for the SIFT permit-phone parser.
 * Column layout (verified from stp08-31ph.csv):
 *   [0] taxpayer_number, [1] outlet_number, [15] telephone
 */

import { describe, it, expect } from 'vitest'
import {
  parseSiftFile,
  splitLine,
  normalizeTaxpayerNumber,
  normalizeOutletNumber,
} from '../sift-parser'

// ── splitLine ────────────────────────────────────────────────────────────────

describe('splitLine', () => {
  it('splits a plain CSV line', () => {
    expect(splitLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('handles quoted fields containing commas', () => {
    expect(splitLine('"Smith, John","Austin","TX"')).toEqual(['Smith, John', 'Austin', 'TX'])
  })

  it('splits tab-delimited lines', () => {
    expect(splitLine('a\tb\tc')).toEqual(['a', 'b', 'c'])
  })

  it('trims leading/trailing whitespace in fields', () => {
    expect(splitLine('  foo , bar , baz ')).toEqual(['foo', 'bar', 'baz'])
  })
})

// ── normalizeTaxpayerNumber ──────────────────────────────────────────────────

describe('normalizeTaxpayerNumber', () => {
  it('returns an 11-digit string, preserving significant leading zeros', () => {
    expect(normalizeTaxpayerNumber('12345678901')).toBe('12345678901')
  })

  it('pads short taxpayer numbers', () => {
    expect(normalizeTaxpayerNumber('1234567890')).toBe('01234567890')
  })

  it('strips non-digits', () => {
    expect(normalizeTaxpayerNumber('1234-5678-901')).toBe('12345678901')
  })

  it('returns empty for all-zeros', () => {
    expect(normalizeTaxpayerNumber('00000000000')).toBe('')
  })

  it('returns empty for blank input', () => {
    expect(normalizeTaxpayerNumber('')).toBe('')
    expect(normalizeTaxpayerNumber('   ')).toBe('')
  })

  it('never exceeds 11 digits after normalization', () => {
    const result = normalizeTaxpayerNumber('12345678901')
    expect(result.length).toBe(11)
  })
})

// ── normalizeOutletNumber ───────────────────────────────────────────────────

describe('normalizeOutletNumber', () => {
  it('strips leading zeros: "00001" → "1"', () => {
    expect(normalizeOutletNumber('00001')).toBe('1')
  })

  it('normalizes "00000412" → "412"', () => {
    expect(normalizeOutletNumber('00000412')).toBe('412')
  })

  it('"412", "00412", "00000412" all normalize identically', () => {
    const v1 = normalizeOutletNumber('412')
    const v2 = normalizeOutletNumber('00412')
    const v3 = normalizeOutletNumber('00000412')
    expect(v1).toBe(v2)
    expect(v2).toBe(v3)
    expect(v1).toBe('412')
  })

  it('returns "" for blank outlet (DIRECT PAY)', () => {
    expect(normalizeOutletNumber('')).toBe('')
    expect(normalizeOutletNumber(null)).toBe('')
    expect(normalizeOutletNumber(undefined)).toBe('')
  })

  it('returns "" for all-zero outlet', () => {
    expect(normalizeOutletNumber('00000')).toBe('')
  })
})

// ── parseSiftFile — happy path ────────────────────────────────────────────────

describe('parseSiftFile', () => {
  // Build a 22-column CSV row where [0]=taxpayer, [1]=outlet, [15]=phone
  function makeRow(taxpayer: string, outlet: string, phone: string, extraCols: string[] = []): string {
    // 22 columns: indices 0-21
    const cols: string[] = new Array(22).fill('')
    cols[0]  = taxpayer
    cols[1]  = outlet
    cols[15] = phone
    extraCols.forEach((v, i) => { if (i + 2 < cols.length) cols[i + 2] = v })
    return cols.join(',')
  }

  it('parses the correct taxpayer_number from column 0', () => {
    const csv = makeRow('12345678901', '00001', '2145550100')
    const { rows } = parseSiftFile(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].taxpayerNumber).toBe('12345678901')
  })

  it('parses the correct outlet_number from column 1', () => {
    const csv = makeRow('12345678901', '00001', '2145550100')
    const { rows } = parseSiftFile(csv)
    expect(rows[0].outletNumber).toBe('1')  // normalized
    expect(rows[0].outletNumberRaw).toBe('00001')
  })

  it('parses the phone from column 15 (not column 8 or 19)', () => {
    const csv = makeRow('12345678901', '00001', '2145550101')
    const { rows } = parseSiftFile(csv)
    expect(rows[0].phone).toBe('2145550101')
  })

  it('skips rows with a blank taxpayer_number', () => {
    const csv = makeRow('', '00001', '2145550100')
    const { rows, skipReasons } = parseSiftFile(csv)
    expect(rows).toHaveLength(0)
    expect(skipReasons.missingTaxpayerNumber).toBe(1)
  })

  it('skips rows with a blank outlet_number (DIRECT PAY)', () => {
    const csv = makeRow('12345678901', '', '2145550100')
    const { rows, skipReasons } = parseSiftFile(csv)
    expect(rows).toHaveLength(0)
    expect(skipReasons.blankOutletNumber).toBe(1)
  })

  it('skips malformed rows with fewer than 16 columns', () => {
    const { rows, skipReasons } = parseSiftFile('12345678901,00001,something')
    expect(rows).toHaveLength(0)
    expect(skipReasons.malformedRow).toBe(1)
  })

  it('keeps phone as null when column 15 is blank', () => {
    const csv = makeRow('12345678901', '00001', '')
    const { rows } = parseSiftFile(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].phone).toBeNull()
  })

  it('reports phoneColFound = true for positional 22-column file', () => {
    const csv = makeRow('12345678901', '00001', '2145550100')
    const { phoneColFound } = parseSiftFile(csv)
    expect(phoneColFound).toBe(true)
  })

  it('parses multiple rows and returns correct counts', () => {
    const row1 = makeRow('12345678901', '00001', '2145550101')
    const row2 = makeRow('12345678902', '00002', '2145550102')
    const row3 = makeRow('', '00003', '2145550103')  // will be skipped
    const csv = [row1, row2, row3].join('\n')
    const { rows, skipReasons } = parseSiftFile(csv)
    expect(rows).toHaveLength(2)
    expect(skipReasons.missingTaxpayerNumber).toBe(1)
  })

  it('respects the limit parameter', () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      makeRow(`1234567890${i}`, '00001', '2145550100')
    ).join('\n')
    const { rows } = parseSiftFile(lines, 3)
    expect(rows).toHaveLength(3)
  })

  it('handles header-row file format', () => {
    const header = 'taxpayer_number,outlet_number,taxpayer_name,taxpayer_address,taxpayer_city,taxpayer_state,taxpayer_zip_code,taxpayer_county_code,taxpayer_phone,outlet_name,outlet_address,outlet_city,outlet_state,outlet_zip_code,outlet_county_code,telephone,taxpayer_type,state_code,outlet_naics_code,outlet_permit_issue_date,outlet_first_sales_date,extra'
    const dataRow = makeRow('12345678901', '00001', '2145550199')
    const { rows, format } = parseSiftFile(`${header}\n${dataRow}`)
    expect(format).toBe('header')
    expect(rows[0].phone).toBe('2145550199')
    expect(rows[0].taxpayerNumber).toBe('12345678901')
  })
})
