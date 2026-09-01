import { AppNav } from '@/components/AppNav'
import { createServiceClient } from '@/lib/supabase/service'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .limit(1)
    .maybeSingle()

  const userName = profile?.full_name?.split(' ')[0] ?? 'Jordan'

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
