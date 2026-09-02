'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { LogOut } from 'lucide-react'

export function MobileTopBar() {
  const router = useRouter()

  async function logout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } catch { /* best-effort */ }
    router.push('/')
    router.refresh()
  }

  return (
    <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-12">
      <div className="flex items-center gap-2">
        <button onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center">
          <Image
            src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png"
            alt="Process.Direct"
            width={200}
            height={56}
            className="h-14 w-auto object-contain"
          />
        </button>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors py-1 px-2 rounded-lg hover:bg-red-50"
      >
        <LogOut size={13} /> Logout
      </button>
    </div>
  )
}
