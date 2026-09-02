/**
 * Public landing page at /.
 * No private data — no CRM sidebar, lead counts, or user information.
 */
import { Suspense } from 'react'
import type { Metadata } from 'next'
import LandingClient from '@/components/landing/LandingClient'

export const metadata: Metadata = {
  title: 'Merchant Radar — Keep More of Every Sale',
  description:
    'We help businesses lower payment-processing costs and get the right payment equipment for the way they sell.',
}

export default function LandingPage() {
  // Suspense required because LandingClient uses useSearchParams()
  return (
    <Suspense>
      <LandingClient />
    </Suspense>
  )
}
