'use server'

import { createClient } from '@/lib/supabase/server'
import type { Territory } from '@/lib/types'

export async function updateTerritory(
  id: string,
  data: Partial<Pick<Territory, 'name' | 'county_codes' | 'days_to_import' | 'is_active'>>
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('territories')
    .update(data)
    .eq('id', id)
    .eq('owner_id', user.id)
}
