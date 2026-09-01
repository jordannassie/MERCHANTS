'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceOwnerId } from '@/lib/workspace'
import type { Territory } from '@/lib/types'

export async function updateTerritory(
  id: string,
  data: Partial<Pick<Territory, 'name' | 'county_codes' | 'days_to_import' | 'is_active'>>
): Promise<void> {
  const db = createServiceClient()
  const ownerId = await getWorkspaceOwnerId()
  await db.from('territories').update(data).eq('id', id).eq('owner_id', ownerId)
}
