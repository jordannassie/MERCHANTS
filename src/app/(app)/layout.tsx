import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppNav } from '@/components/AppNav'
import { bootstrapUser } from '@/lib/actions/bootstrap'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Idempotent: creates profile + default territory if missing
  await bootstrapUser(user.id)

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav />
      {/* Desktop: offset for sidebar */}
      <div className="md:pl-56">
        {/* Mobile: top padding for status bar; bottom padding for nav bar */}
        <main className="pb-20 md:pb-0 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  )
}
