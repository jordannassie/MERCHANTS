/**
 * Workspace identity helpers — single-user architecture.
 *
 * Merchant Radar is a private single-user tool. There is no multi-user auth.
 * All privileged DB operations run server-side using the service-role key.
 * The workspace "owner" is the first (and only) user in Supabase Auth.
 * This user must be created once in the Supabase Dashboard.
 *
 * SERVER-ONLY. Never import from client components.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_DFW_COUNTY_CODES } from '@/lib/constants'

// Module-level cache — valid for the lifetime of the server process / warm function.
let _cachedOwnerId: string | null = null

/**
 * Returns the workspace owner's Supabase user ID.
 * Reads the first auth.users row via the service-role admin API.
 * Throws if no user exists.
 */
export async function getWorkspaceOwnerId(): Promise<string> {
  if (_cachedOwnerId) return _cachedOwnerId

  const supabase = createServiceClient()
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 })

  if (error) throw new Error(`Cannot retrieve workspace user: ${error.message}`)
  if (!data?.users?.length) {
    throw new Error(
      'No user found in Supabase Authentication. ' +
      'Create one in Supabase Dashboard → Authentication → Users.'
    )
  }

  _cachedOwnerId = data.users[0].id
  return _cachedOwnerId
}

/**
 * Returns the active territory for the workspace.
 * Creates the default DFW territory if none exists (idempotent).
 */
export async function ensureWorkspaceTerritory() {
  const supabase = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()

  const { data: existing } = await supabase
    .from('territories')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const { data: created, error } = await supabase
    .from('territories')
    .insert({
      owner_id: ownerId,
      name: 'Dallas–Fort Worth',
      county_codes: DEFAULT_DFW_COUNTY_CODES,
      days_to_import: 14,
      is_active: true,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create default territory: ${error.message}`)
  return created
}

/**
 * Ensures the workspace profile row exists. Safe to call on every load.
 */
export async function ensureWorkspaceProfile(): Promise<void> {
  const supabase = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()

  // Get name from auth user record
  const { data: authData } = await supabase.auth.admin.getUserById(ownerId)
  const fullName =
    authData?.user?.user_metadata?.full_name ??
    authData?.user?.email?.split('@')[0] ??
    'Jordan'

  await supabase
    .from('profiles')
    .upsert({ id: ownerId, full_name: fullName, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: false })
}
