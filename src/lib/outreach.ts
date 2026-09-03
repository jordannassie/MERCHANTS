/**
 * Single source of truth for the outreach SMS message template.
 *
 * Call this everywhere a Copy Message button is rendered so the template
 * never drifts between desktop, mobile, or any future outreach surface.
 */

const SIGNATURE = 'If you still need help with it, I\'d be happy to help. —Jordan\nhttps://process.direct'

/**
 * Build the personalized outreach SMS message.
 *
 * @param businessName - The lead's display / outlet name.
 *   Pass null/undefined to use the generic fallback.
 *
 * @returns The full message text including line breaks.
 *
 * Example output:
 * Hey, this is Jordan with Process.Direct. I saw that MARISCOS LA PERLA LLC
 * is getting set up in Texas. Have you already gotten your card processing/POS set up?
 *
 * If you still need help with it, I'd be happy to help. —Jordan
 * https://process.direct
 */
export function buildOutreachMessage(businessName: string | null | undefined): string {
  const opening = businessName
    ? `Hey, this is Jordan with Process.Direct. I saw that ${businessName} is getting set up in Texas. Have you already gotten your card processing/POS set up?`
    : `Hey, this is Jordan with Process.Direct. I saw that your business is getting set up in Texas. Have you already gotten your card processing/POS set up?`

  return `${opening}\n\n${SIGNATURE}`
}
