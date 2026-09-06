'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, User, Mail, Phone as PhoneIcon } from 'lucide-react'

const LOGO_URL =
  'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png'

export interface ProposalData {
  businessName:              string
  slug:                      string
  savingsMonthly?:           number | null
  transactionRate?:          string | null
  equipment?:                string | null
  contract?:                 string | null
  status:                    string
  accepted:                  boolean
  estimatedMonthlyCardSales?: number | null
}

interface Props {
  data: ProposalData
}

export function ProposalTemplate({ data }: Props) {
  const { businessName, slug, savingsMonthly, transactionRate, equipment, contract } = data
  const [accepted,    setAccepted]    = useState(data.accepted)
  const [loading,     setLoading]     = useState(false)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [sheetOpen,   setSheetOpen]   = useState(false)

  // Monthly card sales slider
  const SLIDER_MIN  = 5_000
  const SLIDER_MAX  = 250_000
  const SLIDER_STEP = 5_000
  const [cardSales, setCardSales] = useState<number>(
    data.estimatedMonthlyCardSales && data.estimatedMonthlyCardSales >= SLIDER_MIN
      ? data.estimatedMonthlyCardSales
      : 50_000
  )
  const [savingVolume, setSavingVolume] = useState(false)
  const saveVolumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleCardSalesChange(val: number) {
    setCardSales(val)
    if (saveVolumeTimeoutRef.current) clearTimeout(saveVolumeTimeoutRef.current)
    setSavingVolume(true)
    saveVolumeTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/proposals/${slug}/card-sales`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ amount: val }),
        })
      } finally {
        setSavingVolume(false)
      }
    }, 800)
  }

  function fmtDollars(n: number) {
    return '$' + n.toLocaleString()
  }

  // Form fields
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const savingsYear = savingsMonthly ? savingsMonthly * 12 : null

  function validate() {
    const errs: Record<string, string> = {}
    if (!name.trim())  errs.name  = 'Name is required.'
    if (!email.trim()) errs.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'Please enter a valid email address.'
    if (!phone.trim()) errs.phone = 'Phone is required.'
    return errs
  }

  async function handleAccept() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      const res  = await fetch(`/api/proposals/${slug}/accept`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
      })
      const json = await res.json()
      if (json.ok) {
        setAccepted(true)
      } else {
        setErrors({ form: json.error ?? 'Something went wrong. Please try again.' })
      }
    } catch {
      setErrors({ form: 'Something went wrong. Please try again.' })
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

          {/* Monthly card sales slider */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl px-6 py-6 mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
              About how much do you expect to process in card sales each month?
            </p>
            <p className="text-3xl font-black text-blue-600 text-center mb-4">
              {fmtDollars(cardSales)}<span className="text-lg font-semibold text-blue-400"> / month</span>
              {cardSales >= SLIDER_MAX && <span className="text-lg font-semibold text-blue-400">+</span>}
            </p>
            <div className="relative">
              <input
                type="range"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                step={SLIDER_STEP}
                value={cardSales}
                onChange={e => handleCardSalesChange(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600"
                style={{ background: `linear-gradient(to right, #2563eb ${((cardSales - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%, #dbeafe ${((cardSales - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%)` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400 font-medium">
              <span>$5K</span>
              <span>{savingVolume ? <span className="text-blue-400 italic">Saving…</span> : null}</span>
              <span>$250K+</span>
            </div>
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
                  <p className="text-lg font-bold text-gray-800">Calculated after rate review</p>
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

          {/* QuickBooks strip */}
          <div className="border border-gray-100 rounded-2xl px-5 py-4 mb-6">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Image
                src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/quickbooks.png"
                alt="QuickBooks"
                width={240}
                height={66}
                className="h-14 w-auto object-contain"
              />
              <div className="hidden sm:block w-px h-8 bg-gray-200" />
              <p className="text-gray-500 text-sm font-medium text-center sm:text-left">
                Syncs seamlessly with your QuickBooks software — no double entry, no headaches.
              </p>
            </div>
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
              {['No pressure', 'No jargon', 'Free initial review', 'USA-based'].map(item => (
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

          {/* CTA form — desktop only inline */}
          <div className="hidden md:block">
            <CtaSection
              accepted={accepted}
              loading={loading}
              errors={errors}
              name={name}   setName={setName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              onAccept={handleAccept}
            />
          </div>

          {/* Mobile: show success inline if already accepted */}
          {accepted && (
            <div className="md:hidden bg-green-50 border border-green-200 rounded-2xl px-6 py-8 text-center">
              <span className="text-2xl font-black text-green-600 block mb-2">✓ Request Sent</span>
              <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Thanks! We'll reach out and send your Service Agreement shortly.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ── Mobile sticky CTA button ─────────────────────────────────────── */}
      {!accepted && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <button
            onClick={() => setSheetOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-base py-4 rounded-xl transition-all"
          >
            Send me Service Agreement ›
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            🔒 Secure · No commitment required
          </p>
        </div>
      )}

      {/* ── Mobile bottom sheet ──────────────────────────────────────────── */}
      {sheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setSheetOpen(false)}
          />
          {/* Sheet */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-10">
            {/* Handle + close */}
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
              <p className="text-sm font-semibold text-gray-800">Get Your Service Agreement</p>
              <button onClick={() => setSheetOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Fill in your details and we'll send your Service Agreement and give you a call to get everything set up.
            </p>
            <CtaSection
              accepted={accepted}
              loading={loading}
              errors={errors}
              name={name}   setName={setName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              onAccept={async () => {
                await handleAccept()
                setSheetOpen(false)
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

function CtaSection({
  accepted, loading, errors,
  name, setName, email, setEmail, phone, setPhone,
  onAccept,
}: {
  accepted:  boolean
  loading:   boolean
  errors:    Record<string, string>
  name:      string;  setName:  (v: string) => void
  email:     string;  setEmail: (v: string) => void
  phone:     string;  setPhone: (v: string) => void
  onAccept:  () => void
}) {
  if (accepted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-8 text-center">
        <span className="text-3xl font-black text-green-600 block mb-2">✓ Proposal Accepted</span>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Thanks! We'll send your Service Agreement so we can get your account set up.
        </p>
      </div>
    )
  }

  const wrapCls = (field: string) =>
    `flex items-center gap-2 bg-white rounded-xl border px-3 py-3 transition focus-within:ring-2 focus-within:ring-blue-500 ${
      errors[field] ? 'border-red-400' : 'border-gray-200'
    }`
  const inputCls = 'flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none'

  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-2xl px-5 py-6 space-y-4">
      <h2 className="text-2xl font-black text-gray-900 text-center tracking-tight">Get Your Service Agreement Today</h2>
      {/* Name + Email row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className={wrapCls('name')}>
            <User size={15} className="text-blue-400 shrink-0" />
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
            />
          </div>
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>
        <div>
          <div className={wrapCls('email')}>
            <Mail size={15} className="text-blue-400 shrink-0" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
        </div>
      </div>

      {/* Phone row */}
      <div>
        <div className={wrapCls('phone')}>
          <PhoneIcon size={15} className="text-blue-400 shrink-0" />
          <input
            type="tel"
            placeholder="Phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className={inputCls}
          />
        </div>
        {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
      </div>

      {/* Form-level error */}
      {errors.form && <p className="text-center text-sm text-red-600">{errors.form}</p>}

      {/* Submit button */}
      <button
        onClick={onAccept}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-base py-4 rounded-xl transition-colors"
      >
        {loading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Sending…
          </>
        ) : (
          'Send me Service Agreement ›'
        )}
      </button>

      <p className="text-center text-xs text-gray-400">
        🔒 Your information is secure and will only be used to process this proposal.
      </p>
    </div>
  )
}
