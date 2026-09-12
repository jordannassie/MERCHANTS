import { describe, it, expect } from 'vitest'
import { parseMissingColumn, withColumnFallback } from '../supabase/resilient-select'

describe('parseMissingColumn', () => {
  it('extracts the column from a PostgREST 42703 message', () => {
    expect(
      parseMissingColumn('column leads.enrichment_error does not exist'),
    ).toBe('enrichment_error')
  })

  it('extracts a bare column name', () => {
    expect(parseMissingColumn('column sms_status does not exist')).toBe('sms_status')
  })

  it('returns null when the message is unrelated', () => {
    expect(parseMissingColumn('JWT expired')).toBeNull()
    expect(parseMissingColumn(undefined)).toBeNull()
  })
})

describe('withColumnFallback', () => {
  it('retries after stripping each missing column and then succeeds', async () => {
    const seen: string[][] = []
    const result = await withColumnFallback(
      ['id', 'enrichment_error', 'sms_status', 'display_name'],
      async columns => {
        seen.push([...columns])
        if (columns.includes('enrichment_error')) {
          return {
            data: null,
            error: { message: 'column leads.enrichment_error does not exist', code: '42703' },
          }
        }
        if (columns.includes('sms_status')) {
          return {
            data: null,
            error: { message: 'column leads.sms_status does not exist', code: '42703' },
          }
        }
        return { data: { id: 'lead-1', display_name: 'TEST' }, error: null }
      },
    )

    expect(result.error).toBeNull()
    expect(result.data).toEqual({ id: 'lead-1', display_name: 'TEST' })
    expect(result.stripped).toEqual(['enrichment_error', 'sms_status'])
    expect(result.usedColumns).toEqual(['id', 'display_name'])
    expect(seen).toHaveLength(3)
  })

  it('returns the original error when it is not a missing column', async () => {
    const result = await withColumnFallback(['id'], async () => ({
      data: null,
      error: { message: 'JWT expired', code: 'PGRST301' },
    }))
    expect(result.error).toBe('JWT expired')
    expect(result.stripped).toEqual([])
  })
})
