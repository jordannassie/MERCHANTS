/**
 * Single source of truth for the outreach SMS message template.
 *
 * Call this everywhere a Copy Message button is rendered so the template
 * never drifts between desktop, mobile, or any future outreach surface.
 *
 * When a proposalUrl is provided, sends a proposal-first message.
 * Otherwise falls back to the original discovery message.
 *
 * All messages end with "Reply STOP to opt out."
 */

const SIGNATURE = `Best,\nJordan`
const OPT_OUT   = `Reply STOP to opt out.`

/**
 * Build the personalized outreach SMS message.
 *
 * @param businessName - The lead's display / outlet name.
 *   Pass null/undefined to use the generic fallback.
 * @param proposalUrl  - If provided, sends a proposal-link message instead
 *   of the generic discovery message.
 *
 * @returns The full message text including exact line breaks.
 */
export function buildOutreachMessage(
  businessName: string | null | undefined,
  proposalUrl?: string | null,
  location?: string | null,
): string {
  const name = businessName?.trim() || 'your business'
  const loc  = location?.trim() || null
  const locPhrase = loc ? `in ${loc}` : 'nearby'

  if (proposalUrl) {
    return [
      `Hi, this is Jordan from Process Direct. I noticed ${name} is getting set up ${locPhrase} — congrats on starting your new business 🎉`,
      `We created a payment processing proposal for you, if it looks good, we can get you set up this week to start accepting payments, and get you a FREE POS system too.`,
      `I'm here if you have any questions.`,
      SIGNATURE,
      OPT_OUT,
      proposalUrl,
    ].join('\n\n')
  }

  const opening = `Hi, this is Jordan from Process Direct. I noticed ${name} is setting up operations ${locPhrase}.`
  const body    = `Have you already arranged your POS system and card processing? If you're still looking for assistance, I'd be glad to help.`

  return `${opening}\n\n${body}\n\n${OPT_OUT}\n\n${SIGNATURE}`
}
