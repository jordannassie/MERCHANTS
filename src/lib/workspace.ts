/**
 * Workspace helpers — true single-workspace, no authentication.
 *
 * Merchant Radar is a private single-workspace tool. There is no login,
 * no Supabase Auth user, no owner_id, and no auth.uid() anywhere.
 * All DB access happens server-side via the service-role key.
 *
 * SERVER-ONLY. Never import from client components.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_DFW_COUNTY_CODES } from '@/lib/constants'

/**
 * Returns the single active territory. Creates the default DFW territory
 * automatically if none exists. Idempotent and auth-free.
 */
export async function ensureWorkspaceTerritory() {
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('territories')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Auto-upgrade the saved-view region from the old system default ('DFW')
    // to 'All Texas' — this only fires when the territory still has the
    // original auto-created value, not a value the user explicitly chose.
    if (existing.region === 'DFW') {
      await supabase
        .from('territories')
        .update({ region: 'All Texas' })
        .eq('id', existing.id)
      return { ...existing, region: 'All Texas' }
    }
    return existing
  }

  const { data: created, error } = await supabase
    .from('territories')
    .insert({
      name: 'All Texas',
      county_codes: DEFAULT_DFW_COUNTY_CODES,
      days_to_import: 30,
      is_active: true,
      region: 'All Texas',
    })
    .select()
    .single()

  if (error) {
    const detail = [error.message, error.code && `code=${error.code}`, error.details, error.hint]
      .filter(Boolean)
      .join(' | ')
    throw new Error(`Failed to create default territory: ${detail}`)
  }

  return created
}
