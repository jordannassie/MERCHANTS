'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, User, Mail, Phone as PhoneIcon, Check } from 'lucide-react'

const LOGO_URL =
  'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png'

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CalcSettings {
  compareRate: number         // default 3.0 — competitor flat rate %
  wholesaleCost: number       // default 1.60 — our wholesale base %
  markupRate: number          // default 0.75 — our markup above wholesale %
  customerPayPercent: number  // default 4.0 — surcharge % passed to customer
  sliderDefault: number       // default 50000
  sliderMin: number           // default 5000
  sliderMax: number           // default 250000
  sliderStep: number          // default 5000
}

export interface ProposalData {
  businessName:               string
  slug:                       string
  savingsMonthly?:            number | null
  transactionRate?:           string | null
  equipment?:                 string | null
  contract?:                  string | null
  status:                     string
  accepted:                   boolean
  estimatedMonthlyCardSales?: number | null
  calcSettings:               CalcSettings
}

interface Props {
  data: ProposalData
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalTemplate({ data }: Props) {
  const { businessName, slug, equipment, calcSettings } = data
  const {
    compareRate,
    wholesaleCost,
    markupRate,
    customerPayPercent,
    sliderMin,
    sliderMax,
    sliderStep,
    sliderDefault,
  } = calcSettings

  // UI state
  const [accepted,   setAccepted]   = useState(data.accepted)
  const [loading,    setLoading]    = useState(false)
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [sheetOpen,  setSheetOpen]  = useState(false)

  // Slider — initialise from DB value if valid, else from settings default
  const [cardSales, setCardSales] = useState<number>(
    data.estimatedMonthlyCardSales && data.estimatedMonthlyCardSales >= sliderMin
      ? data.estimatedMonthlyCardSales
      : sliderDefault
  )
  const [savingVolume,       setSavingVolume]       = useState(false)
  const saveVolumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Option selection (default: wholesale)
  const [selectedOption, setSelectedOption] = useState<'wholesale' | 'customer_pay'>('wholesale')

  // Form fields
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // ── Derived calculator values ────────────────────────────────────────────────
  const effectiveRate    = wholesaleCost + markupRate                       // e.g. 2.35%
  const competitorCost   = cardSales * (compareRate   / 100)                // e.g. $1,500
  const processCost      = cardSales * (effectiveRate  / 100)               // e.g. $1,175
  const monthlySavings   = competitorCost - processCost                     // e.g. $325
  const yearlySavings    = monthlySavings * 12                              // e.g. $3,900

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function fmtDollars(n: number) {
    return '$' + Math.round(n).toLocaleString()
  }

  function fmtRate(r: number) {
    // Show as e.g. "2.35%"
    return r % 1 === 0 ? `${r}%` : `${r.toFixed(2).replace(/\.?0+$/, '')}%`
  }

  const selectedPlanName =
    selectedOption === 'wholesale'
      ? `Wholesale Cost + ${fmtRate(markupRate)}`
      : '$0 Merchant Processing'

  // ── Slider debounced save ────────────────────────────────────────────────────
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

  // ── Form validation ──────────────────────────────────────────────────────────
  function validate() {
    const errs: Record<string, string> = {}
    if (!name.trim())  errs.name  = 'Name is required.'
    if (!email.trim()) errs.email = 'Email is required.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errs.email = 'Please enter a valid email address.'
    if (!phone.trim()) errs.phone = 'Phone is required.'
    return errs
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleAccept() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)

    const calcSnapshot = {
      monthly_sales:               cardSales,
      compare_rate:                compareRate,
      wholesale_cost:              wholesaleCost,
      markup_rate:                 markupRate,
      effective_rate:              effectiveRate,
      customer_pay_percent:        customerPayPercent,
      monthly_cost_competitor:     Math.round(competitorCost),
      monthly_cost_process_direct: Math.round(processCost),
      monthly_savings:             Math.round(monthlySavings),
      yearly_savings:              Math.round(yearlySavings),
      selected_option:             selectedOption,
    }

    try {
      const res  = await fetch(`/api/proposals/${slug}/accept`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:           name.trim(),
          email:          email.trim(),
          phone:          phone.trim(),
          selectedOption,
          calcSnapshot,
        }),
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

  // ── Slider fill % ────────────────────────────────────────────────────────────
  const sliderFill = ((cardSales - sliderMin) / (sliderMax - sliderMin)) * 100

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
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

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center px-4 py-10 pb-32 md:pb-16">
        <div className="w-full max-w-2xl">

          {/* ── Section 1 + 2: Hero ─────────────────────────────────────────── */}
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
              We built a simple payment proposal to help{' '}
              <strong className="text-gray-700">{businessName}</strong> save money, simplify
              setup, and choose the right payment solution.
            </p>
          </div>

          {/* ── Section 3: Monthly sales slider ─────────────────────────────── */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl px-6 py-6 mb-6">
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
              About how much do you expect to process in card sales each month?
            </p>
            <p className="text-4xl font-bold text-blue-600 text-center mb-4">
              {fmtDollars(cardSales)}
              <span className="text-xl font-semibold text-blue-400"> / month</span>
              {cardSales >= sliderMax && (
                <span className="text-xl font-semibold text-blue-400">+</span>
              )}
            </p>
            <div className="relative">
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={sliderStep}
                value={cardSales}
                onChange={e => handleCardSalesChange(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600"
                style={{
                  background: `linear-gradient(to right, #2563eb ${sliderFill}%, #dbeafe ${sliderFill}%)`,
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400 font-medium">
              <span>$5K</span>
              <span>
                {savingVolume ? (
                  <span className="text-blue-400 italic">Saving…</span>
                ) : null}
              </span>
              <span>$250K+</span>
            </div>
          </div>

          {/* ── Section 4: Two pricing option cards ─────────────────────────── */}
          <div className="space-y-4 mb-6">

            {/* Option 1 — Wholesale / Lower-cost processing */}
            <button
              type="button"
              onClick={() => setSelectedOption('wholesale')}
              className={`w-full text-left rounded-2xl p-5 transition-all ${
                selectedOption === 'wholesale'
                  ? 'border-2 border-blue-600 bg-blue-50'
                  : 'border border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {/* Top row: indicator + label + badge */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedOption === 'wholesale'
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {selectedOption === 'wholesale' && (
                      <Check size={14} className="text-white" strokeWidth={3} />
                    )}
                  </div>
                  <span className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
                    Option 1
                  </span>
                </div>
                <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  MOST POPULAR
                </span>
              </div>

              {/* Headline */}
              <div className="mb-4">
                <h3 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight">
                  Save Money
                </h3>
                <p className="text-lg font-semibold text-gray-700">
                  Wholesale Cost + {fmtRate(markupRate)}
                </p>
              </div>

              {/* Comparison rows */}
              <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 space-y-0 mb-2">
                <div className="flex justify-between text-sm py-2">
                  <span className="text-gray-500">
                    Typical processor at {fmtRate(compareRate)}:
                  </span>
                  <span className="font-semibold text-gray-700">
                    {fmtDollars(competitorCost)}/mo
                  </span>
                </div>
                <div className="border-t border-gray-100 flex justify-between text-sm py-2">
                  <span className="text-gray-500">
                    Process.Direct est. at {fmtRate(effectiveRate)}:
                  </span>
                  <span className="font-semibold text-gray-700">
                    {fmtDollars(processCost)}/mo
                  </span>
                </div>
              </div>

              {/* Savings row */}
              <div className="bg-green-50 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-green-700 font-bold text-xl">
                  You save about {fmtDollars(monthlySavings)}/mo
                </span>
                <span className="text-green-700 font-bold text-base whitespace-nowrap ml-4">
                  {fmtDollars(yearlySavings)}/year Savings
                </span>
              </div>
            </button>

            {/* Option 2 — Customer-pay / $0 processing */}
            <button
              type="button"
              onClick={() => setSelectedOption('customer_pay')}
              className={`w-full text-left rounded-2xl p-5 transition-all ${
                selectedOption === 'customer_pay'
                  ? 'border-2 border-blue-600 bg-blue-50'
                  : 'border border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {/* Top row: indicator + label + badge */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedOption === 'customer_pay'
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {selectedOption === 'customer_pay' && (
                      <Check size={14} className="text-white" strokeWidth={3} />
                    )}
                  </div>
                  <span className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
                    Option 2
                  </span>
                </div>
                <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  $0 PROCESSING
                </span>
              </div>

              {/* Headline */}
              <div className="mb-4">
                <h3 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight">
                  Pay $0 in processing
                </h3>
                <p className="text-lg font-semibold text-gray-700">
                  Pass {fmtRate(customerPayPercent)} to the customer
                </p>
              </div>

              {/* Cost row */}
              <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Your merchant processing cost:</span>
                  <span className="text-2xl font-extrabold text-green-600">$0</span>
                </div>
              </div>
            </button>
          </div>

          {/* ── Section 5: Feature cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

            {/* Free Terminal */}
            <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
              <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center">
                <img
                  src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/a920pro-pci-7-secondary-display.webp"
                  alt="FREE POS Terminal"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
                    Free Terminal
                  </p>
                  <span className="inline-block bg-green-500 text-white text-xs font-black px-2 py-0.5 rounded-full tracking-wide">
                    FREE
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {equipment || 'POS System'}
                </p>
                <p className="text-sm text-green-600 font-semibold mt-0.5">
                  Included at no cost
                </p>
              </div>
            </div>

            {/* Local Support */}
            <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
              <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center">
                <img
                  src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Rep.png"
                  alt="Local Rep"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">
                  Local Support
                </p>
                <p className="text-lg font-bold text-gray-900">24/7 Support</p>
                <p className="text-sm text-blue-600 font-semibold mt-0.5">
                  Local rep available to help anytime
                </p>
              </div>
            </div>
          </div>

          {/* ── Video ───────────────────────────────────────────────────────── */}
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

          {/* ── QuickBooks strip ─────────────────────────────────────────────── */}
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

          {/* ── Accepted card brands ─────────────────────────────────────────── */}
          <div className="flex justify-center mb-6">
            <Image
              src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Cards.png"
              alt="Accepted: Amex, Visa, Mastercard, Discover"
              width={280}
              height={52}
              className="h-10 w-auto object-contain"
            />
          </div>

          {/* ── Section 6: Brand logos ───────────────────────────────────────── */}
          <div className="mb-6">
            <p className="text-center text-xs font-semibold tracking-widest text-gray-400 uppercase mb-3">
              Payment Infrastructure Trusted at Scale
            </p>
            <p className="text-center text-sm text-gray-400 max-w-lg mx-auto mb-5 leading-relaxed">
              Process.Direct provides payment solutions through Global Payments infrastructure —
              technology trusted by businesses from local merchants to major national brands.
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

          {/* ── Trust bar ────────────────────────────────────────────────────── */}
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

          {/* ── Section 7: CTA form — desktop only inline ───────────────────── */}
          <div className="hidden md:block">
            <CtaSection
              accepted={accepted}
              loading={loading}
              errors={errors}
              name={name}   setName={setName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              selectedPlanName={selectedPlanName}
              onAccept={handleAccept}
            />
          </div>

          {/* Mobile: show success inline if already accepted */}
          {accepted && (
            <div className="md:hidden bg-green-50 border border-green-200 rounded-2xl px-6 py-8 text-center">
              <span className="text-2xl font-black text-green-600 block mb-2">✓ Request Sent</span>
              <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Thanks! We&apos;ll reach out and send your Service Agreement shortly.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Selected plan: {selectedPlanName}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ── Mobile sticky CTA button ─────────────────────────────────────────── */}
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

      {/* ── Mobile bottom sheet ──────────────────────────────────────────────── */}
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
              <button
                onClick={() => setSheetOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Fill in your details and we&apos;ll send your Service Agreement and give you a call to
              get everything set up.
            </p>
            <CtaSection
              accepted={accepted}
              loading={loading}
              errors={errors}
              name={name}   setName={setName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              selectedPlanName={selectedPlanName}
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

// ─── CTA section (shared desktop + bottom-sheet) ──────────────────────────────

function CtaSection({
  accepted, loading, errors,
  name, setName, email, setEmail, phone, setPhone,
  selectedPlanName,
  onAccept,
}: {
  accepted:         boolean
  loading:          boolean
  errors:           Record<string, string>
  name:             string;  setName:  (v: string) => void
  email:            string;  setEmail: (v: string) => void
  phone:            string;  setPhone: (v: string) => void
  selectedPlanName: string
  onAccept:         () => void
}) {
  if (accepted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-8 text-center">
        <span className="text-3xl font-black text-green-600 block mb-2">✓ Proposal Accepted</span>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Thanks! We&apos;ll send your Service Agreement so we can get your account set up.
        </p>
        <p className="text-xs text-gray-400 mt-2">Selected plan: {selectedPlanName}</p>
      </div>
    )
  }

  const wrapCls = (field: string) =>
    `flex items-center gap-2 bg-white rounded-xl border px-3 py-3 transition focus-within:ring-2 focus-within:ring-blue-500 ${
      errors[field] ? 'border-red-400' : 'border-gray-200'
    }`
  const inputCls =
    'flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none'

  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-2xl px-5 py-6 space-y-4">
      <h2 className="text-2xl font-black text-gray-900 text-center tracking-tight">
        Get a FREE Service Agreement Today
      </h2>

      {/* Selected plan pill */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full">
          <Check size={12} strokeWidth={3} />
          Selected plan: {selectedPlanName}
        </span>
      </div>

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
      {errors.form && (
        <p className="text-center text-sm text-red-600">{errors.form}</p>
      )}

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
