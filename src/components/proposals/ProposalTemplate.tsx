'use client'

import { useState } from 'react'
import Image from 'next/image'

const LOGO_URL =
  'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png'

export interface ProposalData {
  businessName: string
  slug: string
  savingsMonthly?: number | null
  transactionRate?: string | null
  equipment?: string | null
  contract?: string | null
  status: string
  accepted: boolean
}

interface Props {
  data: ProposalData
}

export function ProposalTemplate({ data }: Props) {
  const { businessName, slug, savingsMonthly, transactionRate, equipment, contract } = data
  const [accepted, setAccepted] = useState(data.accepted)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const savingsYear = savingsMonthly ? savingsMonthly * 12 : null

  async function handleAccept() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/proposals/${slug}/accept`, { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        setAccepted(true)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 border-b border-gray-100">
        <a href="https://process.direct" aria-label="Process.Direct home">
          <Image
            src={LOGO_URL}
            alt="Process.Direct"
            width={220}
            height={58}
            className="h-12 w-auto object-contain"
            priority
          />
        </a>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-10 pb-32 md:pb-16">
        <div className="w-full max-w-2xl">
          {/* Hero */}
          <div className="text-center mb-8">
            {/* Document icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-5">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>

            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-2">
              Your Custom Proposal
            </p>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
              {businessName.toUpperCase()}
            </h1>
            <p className="text-gray-500 text-base max-w-lg mx-auto leading-relaxed">
              We put together a simple payment-processing proposal designed to help{' '}
              <strong className="text-gray-700">{businessName}</strong> save money, simplify
              setup, and get the right payment solution in place.
            </p>
          </div>

          {/* 2×2 Card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Estimated savings */}
            <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">
                  Estimated Savings
                </p>
                {savingsMonthly ? (
                  <>
                    <p className="text-2xl font-black text-blue-600">
                      ${savingsMonthly.toLocaleString()}/month
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      ${savingsYear!.toLocaleString()} per year
                    </p>
                  </>
                ) : (
                  <p className="text-lg font-bold text-gray-800">Custom savings review</p>
                )}
              </div>
            </div>

            {/* Transaction fee */}
            <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">
                  Transaction Fee
                </p>
                <p className="text-2xl font-black text-gray-900">
                  {transactionRate || 'Custom pricing'}
                </p>
                {transactionRate && (
                  <p className="text-sm text-gray-500 mt-0.5">per transaction</p>
                )}
              </div>
            </div>

            {/* Equipment */}
            <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">
                  Equipment
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {equipment || 'Based on your business'}
                </p>
                {equipment && (
                  <p className="text-sm text-gray-500 mt-0.5">Modern, portable, and powerful.</p>
                )}
              </div>
            </div>

            {/* Contract */}
            <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">
                  Contract
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {contract || 'Custom setup'}
                </p>
                {contract && (
                  <p className="text-sm text-gray-500 mt-0.5">No long-term commitment.</p>
                )}
              </div>
            </div>
          </div>

          {/* Video */}
          <div className="rounded-2xl overflow-hidden shadow-md mb-6">
            <video
              src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/video/pointofsaleherovideo.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-auto object-cover"
            />
          </div>

          {/* Accepted cards */}
          <div className="flex justify-center mb-6">
            <Image
              src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Cards.png"
              alt="Accepted: Amex, Visa, Mastercard, Discover"
              width={280}
              height={52}
              className="h-10 w-auto object-contain"
            />
          </div>

          {/* Brand logos */}
          <div className="mb-6">
            <p className="text-center text-xs font-semibold tracking-widest text-gray-400 uppercase mb-3">
              Payment Infrastructure Trusted at Scale
            </p>
            <p className="text-center text-sm text-gray-400 max-w-lg mx-auto mb-5 leading-relaxed">
              Process.Direct provides payment solutions through Global Payments infrastructure — technology trusted by businesses from local merchants to major national brands.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
              {[
                { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/brands/starbucks-logo-png-25.png', alt: 'Starbucks' },
                { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/brands/taco-bell-6-logo-png-transparent.png', alt: 'Taco Bell' },
                { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/brands/VW%20images.png', alt: 'Volkswagen' },
                { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/brands/7-eleven_logo.svg.webp', alt: '7-Eleven' },
                { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/brands/Burger_King_Logo.png', alt: 'Burger King' },
                { src: "https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/brands/Carl's_Jr._logo_(2022).svg", alt: "Carl's Jr." },
              ].map(({ src, alt }) => (
                <Image
                  key={alt}
                  src={src}
                  alt={alt}
                  width={70}
                  height={40}
                  className="h-8 w-auto object-contain opacity-90"
                  unoptimized
                />
              ))}
            </div>
          </div>

          {/* Trust bar */}
          <div className="border border-gray-100 rounded-xl px-4 py-3 mb-6">
            <div className="flex items-center justify-around flex-wrap gap-3">
              {['No pressure', 'No jargon', 'Free initial review', 'Texas-based'].map(item => (
                <span key={item} className="flex items-center gap-1.5 text-sm text-gray-500">
                  <svg
                    className="w-4 h-4 text-blue-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* CTA — inline on desktop, sticky on mobile */}
          <div className="hidden md:block">
            <CtaSection
              accepted={accepted}
              loading={loading}
              error={error}
              onAccept={handleAccept}
            />
          </div>
        </div>
      </main>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 shadow-lg">
        <CtaSection
          accepted={accepted}
          loading={loading}
          error={error}
          onAccept={handleAccept}
        />
      </div>
    </div>
  )
}

function CtaSection({
  accepted,
  loading,
  error,
  onAccept,
}: {
  accepted: boolean
  loading: boolean
  error: string | null
  onAccept: () => void
}) {
  if (accepted) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex flex-col items-center gap-2">
          <span className="text-2xl font-black text-green-600">✓ Proposal Accepted</span>
          <p className="text-gray-500 text-sm max-w-sm">
            Thanks. Jordan will send your Service Agreement so we can get your account set up.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-center text-sm text-red-600">{error}</p>
      )}
      <button
        onClick={onAccept}
        disabled={loading}
        className="w-full max-w-xl mx-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-base py-4 rounded-xl transition-colors"
      >
        {loading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing…
          </>
        ) : (
          'I accept the proposal, send me a Service Agreement ›'
        )}
      </button>
      <p className="text-center text-xs text-gray-400">
        🔒 Your information is secure and will only be used to process this proposal.
      </p>
    </div>
  )
}
