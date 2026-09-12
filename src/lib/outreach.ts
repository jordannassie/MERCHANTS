/**
 * Single source of truth for INITIAL SMS / SMS #1.
 *
 * Every preview and every QUO send must go through
 * buildInitialOutreachMessage() / renderInitialOutreachTemplate().
 * Follow-up SMS #2–#4 stay in followup-engine.ts and must not use this file.
 */

export const INITIAL_OUTREACH_SETTING_KEY = 'initial_outreach_message'
export const STOP_LINE = 'Reply STOP to opt out.'

/**
 * Canonical Initial SMS template.
 * STOP is immediately before the proposal URL. Nothing follows the URL.
 */
export const INITIAL_SMS_TEMPLATE =
  `Hi, this is Jordan from Process Direct.

Congrats on getting {BUSINESS_NAME} set up in {CITY} 🎉

Are you taking payments yet — in person, online, or both?

We put together a payment-processing proposal for you. If it looks good, I can help get you set up this week, including a FREE POS system for your businesses.

Best, Jordan
${STOP_LINE}
{PROPOSAL_URL}`

function isCurrentInitialTemplate(stored: string): boolean {
  return (
    stored.includes('Are you taking payments yet') &&
    stored.includes('{BUSINESS_NAME}') &&
    stored.includes('{CITY}') &&
    isInitialSmsCompliant(stored, '{PROPOSAL_URL}')
  )
}

export interface InitialOutreachVars {
  businessName: string
  city: string
  proposalUrl: string
}

export function normalizeInitialOutreachVars(
  businessName: string | null | undefined,
  proposalUrl: string | null | undefined,
  city?: string | null,
): InitialOutreachVars {
  return {
    businessName: businessName?.trim() || 'your business',
    city: city?.trim() || 'your area',
    proposalUrl: (proposalUrl ?? '').trim() || '{PROPOSAL_URL}',
  }
}

/** Replace placeholders. Does not add extra lines after the URL. */
export function renderInitialOutreachTemplate(
  template: string,
  vars: InitialOutreachVars,
): string {
  return template
    .replace(/\{BUSINESS_NAME\}/g, vars.businessName)
    .replace(/\{CITY\}/g, vars.city)
    .replace(/\{PROPOSAL_URL\}/g, vars.proposalUrl)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

export function isInitialSmsCompliant(
  message: string,
  proposalUrl?: string | null,
): boolean {
  const lines = message.replace(/\r\n/g, '\n').split('\n')
  const nonempty = lines.map(l => l.trim()).filter(Boolean)
  if (nonempty.length < 2) return false
  if (!message.includes(STOP_LINE)) return false

  const last = nonempty[nonempty.length - 1]
  const url = (proposalUrl ?? '').trim()
  const lastIsUrl = url
    ? last === url
    : last.startsWith('http://') || last.startsWith('https://') || last === '{PROPOSAL_URL}'
  if (!lastIsUrl) return false

  const stopIdx = nonempty.lastIndexOf(STOP_LINE)
  return stopIdx !== -1 && stopIdx === nonempty.length - 2
}

/**
 * Build the exact Initial SMS string sent to QUO and shown in admin previews.
 */
export function buildInitialOutreachMessage(
  businessName: string | null | undefined,
  proposalUrl: string | null | undefined,
  city?: string | null,
  template?: string | null,
): string {
  const vars = normalizeInitialOutreachVars(businessName, proposalUrl, city)
  const source = template?.trim() || INITIAL_SMS_TEMPLATE
  const rendered = renderInitialOutreachTemplate(source, vars)

  if (isInitialSmsCompliant(rendered, vars.proposalUrl)) {
    return rendered
  }

  // Safety net: never send an Initial SMS without STOP immediately before the URL.
  const withoutUrl = rendered
    .replace(new RegExp(`\\n*${escapeRegExp(vars.proposalUrl)}\\s*$`), '')
    .replace(new RegExp(`\\n*${escapeRegExp(STOP_LINE)}\\s*$`), '')
    .trimEnd()

  return `${withoutUrl}\n\n${STOP_LINE}\n\n${vars.proposalUrl}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function getInitialOutreachTemplate(
  db: { from: (table: string) => any },
): Promise<string> {
  const { data } = await db
    .from('system_settings')
    .select('value')
    .eq('key', INITIAL_OUTREACH_SETTING_KEY)
    .maybeSingle()

  const stored = typeof data?.value === 'string' ? data.value.trim() : ''
  return stored && isCurrentInitialTemplate(stored) ? stored : INITIAL_SMS_TEMPLATE
}

/**
 * @deprecated Use buildInitialOutreachMessage. Kept so older imports cannot drift.
 */
export function buildOutreachMessage(
  businessName: string | null | undefined,
  proposalUrl?: string | null,
  location?: string | null,
): string {
  return buildInitialOutreachMessage(businessName, proposalUrl, location)
}
