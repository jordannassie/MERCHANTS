/**
 * Single source of truth for the outreach SMS message template.
 *
 * Call this everywhere a Copy Message button is rendered so the template
 * never drifts between desktop, mobile, or any future outreach surface.
 *
 * Message format (exact line breaks preserved for SMS/iMessage preview):
 *
 *   Hi, this is Jordan from Process Direct. I noticed BUSINESS NAME is setting
 *   up operations in Texas.
 *
 *   Have you already arranged your POS system and card processing? If you're
 *   still looking for assistance, I'd be glad to help.
 *
 *   Best,
 *   Jordan
 *   https://process.direct/
 */

const SIGNATURE = `Best,\nJordan\nhttps://process.direct/`

/**
 * Build the personalized outreach SMS message.
 *
 * @param businessName - The lead's display / outlet name.
 *   Pass null/undefined to use the generic fallback.
 *
 * @returns The full message text including exact line breaks.
 */
export function buildOutreachMessage(businessName: string | null | undefined): string {
  const name = businessName?.trim() || 'your business'

  const opening = `Hi, this is Jordan from Process Direct. I noticed ${name} is setting up operations in Texas.`
  const body    = `Have you already arranged your POS system and card processing? If you're still looking for assistance, I'd be glad to help.`

  return `${opening}\n\n${body}\n\n${SIGNATURE}`
}
