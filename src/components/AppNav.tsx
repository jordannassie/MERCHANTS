'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Columns3, CalendarClock, Settings, LogOut, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV = [
  { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/leads',       label: 'Leads',        icon: Users },
  { href: '/pipeline',    label: 'Pipeline',     icon: Columns3 },
  { href: '/follow-ups',  label: 'Follow-ups',   icon: CalendarClock },
  { href: '/settings',    label: 'Settings',     icon: Settings },
]

export function AppNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-56 bg-gray-900 text-white z-40">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-800">
          <Crosshair size={20} className="text-blue-400 shrink-0" />
          <span className="font-semibold text-sm">Merchant Radar</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex safe-area-bottom">
        {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                active ? 'text-blue-600' : 'text-gray-500'
              )}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
