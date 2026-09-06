/**
 * Public landing page at /.
 * No private data — no CRM sidebar, lead counts, or user information.
 */
import { Suspense } from 'react'
import type { Metadata } from 'next'
import LandingClient from '@/components/landing/LandingClient'

const HERO_IMAGE = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Terms.png'
const SITE_URL   = 'https://process.direct'

export const metadata: Metadata = {
  title: 'Process.Direct — Save More on Every Sale',
  description:
    'We help businesses lower payment-processing costs and get the right payment equipment for the way they sell.',
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title:       'Process.Direct — Save More on Every Sale',
    description: 'We help businesses lower payment-processing costs and get the right payment equipment for the way they sell.',
    url:         SITE_URL,
    siteName:    'Process.Direct',
    images: [{ url: HERO_IMAGE, width: 1200, height: 630, alt: 'Process.Direct — Save More on Every Sale' }],
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Process.Direct — Save More on Every Sale',
    description: 'We help businesses lower payment-processing costs and get the right payment equipment for the way they sell.',
    images:      [HERO_IMAGE],
  },
}

export default function LandingPage() {
  // Suspense required because LandingClient uses useSearchParams()
  return (
    <Suspense>
      <LandingClient />
    </Suspense>
  )
}
