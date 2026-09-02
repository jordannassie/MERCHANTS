'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

type Phase = 'idle' | 'loading' | 'done'

export function NavigationProgress() {
  const pathname = usePathname()
  const [phase, setPhase] = useState<Phase>('idle')
  const [width, setWidth] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const prevPath = useRef(pathname)

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const complete = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setWidth(100)
    setPhase('done')
    timers.current.push(
      setTimeout(() => {
        setPhase('idle')
        setWidth(0)
      }, 350),
    )
  }, [])

  const start = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPhase('loading')
    setWidth(15)
    timers.current.push(setTimeout(() => setWidth(40), 150))
    timers.current.push(setTimeout(() => setWidth(65), 700))
    timers.current.push(setTimeout(() => setWidth(82), 1500))
  }, [])

  // Complete when pathname changes (route has loaded)
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname
      complete()
    }
  }, [pathname, complete])

  // Intercept link clicks to start the bar immediately
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element).closest('a')
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('http') ||
        href.startsWith('tel:') ||
        href.startsWith('mailto:') ||
        a.target === '_blank'
      )
        return
      start()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [start])

  // Safety valve: auto-complete after 8 s if the route change wasn't detected
  useEffect(() => {
    if (phase !== 'loading') return
    const t = setTimeout(complete, 8000)
    return () => clearTimeout(t)
  }, [phase, complete])

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers])

  if (phase === 'idle') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none">
      <div
        className="h-full bg-blue-500 transition-[width] ease-out"
        style={{
          width: `${width}%`,
          transitionDuration: phase === 'done' ? '150ms' : '400ms',
          boxShadow: '0 0 8px rgba(59,130,246,0.65)',
        }}
      />
    </div>
  )
}
