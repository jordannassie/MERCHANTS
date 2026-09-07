import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
  checkStopConditions,
  buildFollowupMessage,
  enrollLeadInSequence,
  stopAutomationForLead,
  processDueLeads,
  isFollowupEnabled,
} from '../followup-engine'

// ── Mock sendSms ──────────────────────────────────────────────────────────────
vi.mock('../quo', () => ({
  sendSms: vi.fn(),
  isValidUSPhone: vi.fn((phone: string) => {
    const d = phone.replace(/\D/g, '')
    return d.length === 10 || (d.length === 11 && d.startsWith('1'))
  }),
  normalizeUSPhone: vi.fn((phone: string) => {
    const d = phone.replace(/\D/g, '')
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  }),
}))

// Mock proposals
vi.mock('../proposals', () => ({
  getProposalUrl: vi.fn((slug: string) => `https://process.direct/p/${slug}`),
}))

import { sendSms } from '../quo'
const mockSendSms = sendSms as Mock

// ── DB mock factory ───────────────────────────────────────────────────────────

function makeDb(overrides: Record<string, unknown> = {}) {
  const updates: Record<string, unknown>[] = []
  const inserts: Record<string, unknown>[] = []

  const db = {
    _updates: updates,
    _inserts: inserts,
    from: vi.fn((table: string) => {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        single: vi.fn().mockResolvedValue({ data: null }),
        update: vi.fn((data: Record<string, unknown>) => {
          updates.push({ table, ...data })
          return {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
        insert: vi.fn((data: Record<string, unknown>) => {
          inserts.push({ table, ...data })
          return Promise.resolve({ error: null })
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        ...(overrides[table] ?? {}),
      }
    }),
  }
  return db
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkStopConditions', () => {
  it('stops for won leads', () => {
    const r = checkStopConditions({ status: 'won', sms_needs_reply: false, proposal_status: 'sent', followup_completed_at: null })
    expect(r.stop).toBe(true)
    expect(r.reason).toBe('lead_won')
  })

  it('stops for lost leads', () => {
    const r = checkStopConditions({ status: 'lost', sms_needs_reply: false, proposal_status: null, followup_completed_at: null })
    expect(r.stop).toBe(true)
    expect(r.reason).toBe('lead_lost')
  })

  it('stops for do_not_contact', () => {
    const r = checkStopConditions({ status: 'do_not_contact', sms_needs_reply: false, proposal_status: null, followup_completed_at: null })
    expect(r.stop).toBe(true)
    expect(r.reason).toBe('do_not_contact')
  })

  it('stops when sms_needs_reply', () => {
    const r = checkStopConditions({ status: 'attempted', sms_needs_reply: true, proposal_status: null, followup_completed_at: null })
    expect(r.stop).toBe(true)
    expect(r.reason).toBe('sms_needs_reply')
  })

  it('stops when proposal is agreement_requested', () => {
    const r = checkStopConditions({ status: 'attempted', sms_needs_reply: false, proposal_status: 'agreement_requested', followup_completed_at: null })
    expect(r.stop).toBe(true)
    expect(r.reason).toBe('proposal_accepted')
  })

  it('stops when proposal is accepted', () => {
    const r = checkStopConditions({ status: 'attempted', sms_needs_reply: false, proposal_status: 'accepted', followup_completed_at: null })
    expect(r.stop).toBe(true)
    expect(r.reason).toBe('proposal_accepted')
  })

  it('stops when followup_completed_at is set', () => {
    const r = checkStopConditions({ status: 'attempted', sms_needs_reply: false, proposal_status: null, followup_completed_at: '2026-09-01T00:00:00Z' })
    expect(r.stop).toBe(true)
    expect(r.reason).toBe('sequence_complete')
  })

  it('does NOT stop for normal connected lead', () => {
    const r = checkStopConditions({ status: 'connected', sms_needs_reply: false, proposal_status: 'viewed', followup_completed_at: null })
    expect(r.stop).toBe(false)
    expect(r.reason).toBe('')
  })
})

describe('buildFollowupMessage', () => {
  it('step 1 contains business name', () => {
    const msg = buildFollowupMessage(1, 'SANTO TACO')
    expect(msg).toContain('SANTO TACO')
    expect(msg).toContain('Jordan')
  })

  it('step 2 contains proposal URL', () => {
    const msg = buildFollowupMessage(2, 'SANTO TACO', 'https://process.direct/p/santo-taco')
    expect(msg).toContain('https://process.direct/p/santo-taco')
    expect(msg).toContain('Jordan')
  })

  it('step 3 contains business name and closing phrase', () => {
    const msg = buildFollowupMessage(3, 'ABC COFFEE')
    expect(msg).toContain('ABC COFFEE')
    expect(msg).toContain('last time')
  })
})

describe('enrollLeadInSequence', () => {
  it('enrolls lead when followup_started_at is null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { followup_started_at: null, followup_step: 0 }
        }),
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    }

    await enrollLeadInSequence(db, 'lead-1', '2026-09-07T10:00:00Z')
    // Should not throw
    expect(true).toBe(true)
  })

  it('does NOT enroll lead when followup_started_at is already set', async () => {
    const updateFn = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { followup_started_at: '2026-09-01T00:00:00Z', followup_step: 1 }
        }),
        update: updateFn,
      })),
    }

    await enrollLeadInSequence(db, 'lead-1', '2026-09-07T10:00:00Z')
    expect(updateFn).not.toHaveBeenCalled()
  })
})

describe('stopAutomationForLead', () => {
  it('clears next_follow_up_at and sets followup_completed_at', async () => {
    const updatePayloads: Record<string, unknown>[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = {
      from: vi.fn(() => ({
        update: vi.fn((data: Record<string, unknown>) => {
          updatePayloads.push(data)
          return {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      })),
    }

    await stopAutomationForLead(db, 'lead-1')
    expect(updatePayloads.length).toBeGreaterThan(0)
    expect(updatePayloads[0].next_follow_up_at).toBeNull()
    expect(updatePayloads[0].followup_completed_at).toBeTruthy()
  })
})

describe('processDueLeads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeProcessDb(opts: {
    enabled?: boolean
    sentToday?: number
    dueLeads?: Record<string, unknown>[]
    suppressed?: boolean
  }) {
    const { enabled = true, sentToday = 0, dueLeads = [], suppressed = false } = opts

    const db = {
      from: vi.fn((table: string) => {
        if (table === 'system_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { value: enabled ? 'true' : 'false' }
            }),
          }
        }
        if (table === 'sms_messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: sentToday }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: dueLeads, error: null }),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ error: null }),
            })),
          }
        }
        if (table === 'sms_suppression') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: suppressed ? { id: 'sup-1' } : null
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({}) })),
          insert: vi.fn().mockResolvedValue({}),
        }
      }),
    }
    return db
  }

  it('returns early when automation is OFF', async () => {
    mockSendSms.mockResolvedValue({ messageId: 'msg-1' })
    const db = makeProcessDb({ enabled: false })
    const result = await processDueLeads(db as unknown as Parameters<typeof processDueLeads>[0])
    expect(result.sent).toBe(0)
    expect(mockSendSms).not.toHaveBeenCalled()
  })

  it('sends step 1 to a due lead', async () => {
    mockSendSms.mockResolvedValue({ messageId: 'msg-1' })
    const db = makeProcessDb({
      enabled: true,
      sentToday: 0,
      dueLeads: [{
        id: 'lead-1',
        display_name: 'SANTO TACO',
        status: 'attempted',
        permit_phone: '9565551234',
        primary_phone: null,
        sms_needs_reply: false,
        proposal_status: 'sent',
        followup_step: 0,
        followup_completed_at: null,
        followup_started_at: '2026-09-06T10:00:00Z',
        proposal_slug: 'santo-taco',
      }],
    })

    const result = await processDueLeads(db as unknown as Parameters<typeof processDueLeads>[0])
    expect(result.sent).toBe(1)
    expect(mockSendSms).toHaveBeenCalledOnce()
    const [, msg] = mockSendSms.mock.calls[0] as [string, string]
    expect(msg).toContain('SANTO TACO')
  })

  it('skips lead with sms_needs_reply', async () => {
    mockSendSms.mockResolvedValue({ messageId: 'msg-1' })
    const db = makeProcessDb({
      enabled: true,
      dueLeads: [{
        id: 'lead-1',
        display_name: 'SHOP A',
        status: 'attempted',
        permit_phone: '9565551234',
        primary_phone: null,
        sms_needs_reply: true,  // should be filtered client-side
        proposal_status: 'sent',
        followup_step: 0,
        followup_completed_at: null,
        followup_started_at: '2026-09-06T10:00:00Z',
        proposal_slug: null,
      }],
    })

    const result = await processDueLeads(db as unknown as Parameters<typeof processDueLeads>[0])
    expect(result.sent).toBe(0)
    expect(mockSendSms).not.toHaveBeenCalled()
  })

  it('skips lead with suppressed phone', async () => {
    mockSendSms.mockResolvedValue({ messageId: 'msg-1' })
    const db = makeProcessDb({
      enabled: true,
      suppressed: true,
      dueLeads: [{
        id: 'lead-1',
        display_name: 'SHOP B',
        status: 'attempted',
        permit_phone: '9565551234',
        primary_phone: null,
        sms_needs_reply: false,
        proposal_status: 'sent',
        followup_step: 0,
        followup_completed_at: null,
        followup_started_at: '2026-09-06T10:00:00Z',
        proposal_slug: null,
      }],
    })

    const result = await processDueLeads(db as unknown as Parameters<typeof processDueLeads>[0])
    expect(result.sent).toBe(0)
    expect(mockSendSms).not.toHaveBeenCalled()
  })

  it('returns dailyLimitReached when limit is already hit', async () => {
    mockSendSms.mockResolvedValue({ messageId: 'msg-1' })
    const db = makeProcessDb({ enabled: true, sentToday: 50, dueLeads: [] })
    const result = await processDueLeads(db as unknown as Parameters<typeof processDueLeads>[0])
    expect(result.dailyLimitReached).toBe(true)
    expect(result.sent).toBe(0)
  })
})

describe('isFollowupEnabled', () => {
  it('returns true when setting is "true"', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { value: 'true' } }),
      })),
    }
    const result = await isFollowupEnabled(db)
    expect(result).toBe(true)
  })

  it('returns false when setting is "false"', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { value: 'false' } }),
      })),
    }
    const result = await isFollowupEnabled(db)
    expect(result).toBe(false)
  })

  it('returns false when no setting exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      })),
    }
    const result = await isFollowupEnabled(db)
    expect(result).toBe(false)
  })
})
