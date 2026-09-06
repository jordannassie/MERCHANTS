import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Convert a business name to a URL-safe slug.
 * e.g. "SANTO TACO" → "santo-taco"
 */
export function slugifyBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')   // remove non-alphanumeric (except spaces)
    .replace(/\s+/g, '-')          // spaces → hyphens
    .replace(/-{2,}/g, '-')        // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '')       // trim leading/trailing hyphens
    .slice(0, 60)                  // max 60 chars
}

/**
 * Get the full public proposal URL for a slug.
 * Uses NEXT_PUBLIC_SITE_URL, falls back to 'https://process.direct'.
 */
export function getProposalUrl(slug: string): string {
  const base =
    (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://process.direct').replace(/\/$/, '')
  return `${base}/p/${slug}`
}

/**
 * Get or create a unique proposal_slug for a lead (server-side only).
 * - If the lead already has a proposal_slug, return it immediately.
 * - Otherwise generate from name, handle conflicts by appending -2, -3, etc.
 *   Conflict detection uses a SELECT before each UPDATE (avoids unique error).
 * - Saves the slug to DB and returns it.
 */
export async function ensureProposalSlug(
  db: SupabaseClient,
  leadId: string,
  name: string | null | undefined,
): Promise<string> {
  // Check if slug already exists
  const { data: existing } = await db
    .from('leads')
    .select('proposal_slug')
    .eq('id', leadId)
    .single()

  if (existing?.proposal_slug) return existing.proposal_slug as string

  // Generate base slug from name or fallback to lead ID prefix
  const baseName = name?.trim() || ''
  const baseSlug = baseName ? slugifyBusinessName(baseName) : leadId.slice(0, 8)

  // Try base slug, then base-2, base-3, … until no conflict
  let candidate = baseSlug
  let attempt = 1

  while (true) {
    // Check for existing record with this slug (exclude current lead)
    const { data: conflict } = await db
      .from('leads')
      .select('id')
      .eq('proposal_slug', candidate)
      .neq('id', leadId)
      .maybeSingle()

    if (!conflict) {
      // No conflict — save it
      const { error } = await db
        .from('leads')
        .update({ proposal_slug: candidate })
        .eq('id', leadId)

      if (!error) return candidate

      // If somehow still a race-condition error, increment and retry
      if (error.code === '23505') {
        attempt++
        candidate = `${baseSlug}-${attempt}`
        continue
      }

      console.error('[ensureProposalSlug] DB error:', error)
      return candidate
    }

    attempt++
    candidate = `${baseSlug}-${attempt}`
  }
}
