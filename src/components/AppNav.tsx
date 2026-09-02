'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, Columns3, CalendarClock, Settings, Upload, LogOut, LifeBuoy } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/leads',       label: 'Leads',       icon: Users },
  { href: '/pipeline',    label: 'Pipeline',    icon: Columns3 },
  { href: '/follow-ups',  label: 'Follow-ups',  icon: CalendarClock },
  { href: '/support',     label: 'Support',     icon: LifeBuoy },
  { href: '/settings',    label: 'Imports',     icon: Upload },
  { href: '/settings',    label: 'Settings',    icon: Settings },
]

export function AppNav({ userName = 'Jordan' }: { userName?: string }) {
  const pathname = usePathname()

  const initials = userName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-56 bg-white border-r border-gray-200 z-40">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
          <button onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center">
            <Image
              src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png"
              alt="Process.Direct"
              width={240}
              height={64}
              className="h-16 w-auto object-contain"
            />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = label === 'Dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href) && href !== '/dashboard'
            return (
              <Link
                key={label}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User footer + Logout */}
        <div className="p-3 border-t border-gray-100 space-y-1">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* ── Mobile bottom nav ────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex safe-area-bottom">
        {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={label}
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

// ─── Logout button ───────────────────────────────────────────────────────────
function LogoutButton() {
  const router = useRouter()

  async function logout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } catch { /* best-effort */ }
    // Push to landing page then refresh to clear the Next.js router cache
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
    >
      <LogOut size={13} /> Logout
    </button>
  )
}
