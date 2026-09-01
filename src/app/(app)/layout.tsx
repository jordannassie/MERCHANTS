import { AppNav } from '@/components/AppNav'
import { ensureWorkspaceProfile, ensureWorkspaceTerritory } from '@/lib/workspace'
import { createServiceClient } from '@/lib/supabase/service'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Bootstrap profile + territory idempotently on every load
  try {
    await ensureWorkspaceProfile()
    await ensureWorkspaceTerritory()
  } catch {
    // If Supabase isn't configured yet, continue to show the UI
  }

  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .limit(1)
    .maybeSingle()

  const userName = profile?.full_name ?? 'Jordan'

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav userName={userName} />
      <div className="md:pl-56">
        <main className="pb-20 md:pb-0 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
