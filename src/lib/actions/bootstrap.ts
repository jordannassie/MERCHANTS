'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_DFW_COUNTY_CODES } from '@/lib/constants'

/**
 * Idempotently creates a profile and default DFW territory for a user.
 * Called from the app layout on every authenticated load.
 */
export async function bootstrapUser(userId: string) {
  const supabase = createServiceClient()

  // Profile
  await supabase.from('profiles').upsert(
    { id: userId, updated_at: new Date().toISOString() },
    { onConflict: 'id', ignoreDuplicates: true }
  )

  // Default territory — only insert if none exists
  const { data: existing } = await supabase
    .from('territories')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .single()

  if (!existing) {
    await supabase.from('territories').insert({
      owner_id: userId,
      name: 'Dallas–Fort Worth',
      county_codes: DEFAULT_DFW_COUNTY_CODES,
      days_to_import: 14,
      is_active: true,
    })
  }
}
