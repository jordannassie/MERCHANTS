import { describe, it, expect } from 'vitest'
import {
  INITIAL_SMS_TEMPLATE,
  STOP_LINE,
  buildInitialOutreachMessage,
  isInitialSmsCompliant,
  renderInitialOutreachTemplate,
} from '../outreach'

const URL = 'https://process.direct/p/santo-taco'

const EXPECTED = `Hi, this is Jordan from Process.Direct. I noticed SANTO TACO is getting set up in Austin — congrats on starting your new business 🎉

We created a payment processing proposal for you. If it looks good, we can get you set up this week to start accepting payments, and get you a FREE POS system too.

I'm here if you have any questions.

Best,
Jordan

Reply STOP to opt out.

https://process.direct/p/santo-taco`

describe('buildInitialOutreachMessage', () => {
  it('matches the required SMS #1 structure character-for-character', () => {
    const message = buildInitialOutreachMessage('SANTO TACO', URL, 'Austin')
    expect(message).toBe(EXPECTED)
  })

  it('puts STOP immediately before the proposal URL and nothing after it', () => {
    const message = buildInitialOutreachMessage('SANTO TACO', URL, 'Austin')
    const lines = message.split('\n').map(l => l.trim()).filter(Boolean)
    expect(lines[lines.length - 2]).toBe(STOP_LINE)
    expect(lines[lines.length - 1]).toBe(URL)
    expect(message.endsWith(URL)).toBe(true)
    expect(message.indexOf(URL)).toBe(message.lastIndexOf(URL))
  })

  it('uses Process.Direct and the period before If it looks good', () => {
    const message = buildInitialOutreachMessage('SANTO TACO', URL, 'Austin')
    expect(message).toContain('Process.Direct')
    expect(message).toContain('proposal for you. If it looks good')
    expect(message).not.toContain('Process Direct')
  })

  it('is compliant', () => {
    expect(isInitialSmsCompliant(EXPECTED, URL)).toBe(true)
    expect(isInitialSmsCompliant(INITIAL_SMS_TEMPLATE, '{PROPOSAL_URL}')).toBe(true)
  })

  it('rejects a message that omits STOP', () => {
    const bad = EXPECTED.replace(`${STOP_LINE}\n\n`, '')
    expect(isInitialSmsCompliant(bad, URL)).toBe(false)
  })

  it('rejects a message with text after the URL', () => {
    expect(isInitialSmsCompliant(`${EXPECTED}\n\nThanks!`, URL)).toBe(false)
  })

  it('repairs a saved template that forgot STOP', () => {
    const broken = `Hi {BUSINESS_NAME}\n\n{PROPOSAL_URL}`
    const message = buildInitialOutreachMessage('SANTO TACO', URL, 'Austin', broken)
    expect(message.includes(STOP_LINE)).toBe(true)
    expect(isInitialSmsCompliant(message, URL)).toBe(true)
  })

  it('renders placeholders from the saved template', () => {
    const rendered = renderInitialOutreachTemplate(INITIAL_SMS_TEMPLATE, {
      businessName: 'SANTO TACO',
      city: 'Austin',
      proposalUrl: URL,
    })
    expect(rendered).toBe(EXPECTED)
  })
})
