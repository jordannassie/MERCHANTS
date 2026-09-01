import { AppNav } from '@/components/AppNav'
import { ensureWorkspaceTerritory } from '@/lib/workspace'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Bootstrap the global territory idempotently on every load.
  // Silent failure if Supabase isn't configured yet.
  try {
    await ensureWorkspaceTerritory()
  } catch {
    // Tables may not exist yet — the app will show an appropriate state.
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav userName="Jordan" />
      <div className="md:pl-56">
        <main className="pb-20 md:pb-0 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
