'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, User, Mail, Phone as PhoneIcon, Check, CreditCard, MonitorSmartphone } from 'lucide-react'
import {
  PAYMENT_ACCEPTANCE_OPTIONS,
  type PaymentAcceptance,
} from '@/lib/proposals'

const LOGO_URL =
  'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png'
const TAP_ICON_URL =
  'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Tap%20clear.png'

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
  const { businessName, slug, calcSettings } = data
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
  const [paymentAcceptance, setPaymentAcceptance] = useState<PaymentAcceptance | null>(null)

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
    if (!paymentAcceptance) errs.paymentAcceptance = 'Please choose how you want to accept payments.'
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
      payment_acceptance:          paymentAcceptance,
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
          paymentAcceptance,
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
      <nav className="px-6 py-4 border-b border-gray-100 flex justify-center">
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
            <Image
              src={TAP_ICON_URL}
              alt="Tap"
              width={252}
              height={72}
              className="mx-auto h-[72px] w-auto object-contain mb-3"
            />
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
                  Wholesale Cost + {fmtRate(markupRate)}*
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
                  Pay $0 in processing*
                </h3>
                <p className="text-lg font-semibold text-gray-700">
                  Pass {fmtRate(customerPayPercent)} to the customer*
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

            {/* Payments your way */}
            <div className="border border-gray-200 rounded-xl p-5 flex items-start gap-4">
              <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-blue-50 flex items-center justify-center">
                <MonitorSmartphone className="w-8 h-8 text-blue-600" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">
                  Payments Your Way
                </p>
                <p className="text-lg font-bold text-gray-900">
                  In-Person POS + Online Payments
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  Accept cards at the counter, on your website, by payment link, or invoice.
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
          <div className="hidden md:block pt-8">
            <div className="relative">
            <CreditCardBadge />
            <CtaSection
              accepted={accepted}
              loading={loading}
              errors={errors}
              name={name}   setName={setName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              selectedPlanName={selectedPlanName}
              cardSales={cardSales}
              monthlySavings={monthlySavings}
              yearlySavings={yearlySavings}
              selectedOption={selectedOption}
              paymentAcceptance={paymentAcceptance}
              setPaymentAcceptance={setPaymentAcceptance}
              onAccept={handleAccept}
            />
            </div>
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

        {/* ── Fine print — absolute bottom ─────────────────────────────────── */}
        <div className="w-full max-w-2xl mt-10 px-1 text-[10px] text-gray-400 leading-relaxed space-y-1.5">
          <p>* Pricing and savings estimates may vary based on processing volume, card mix, transaction type, business type, and underwriting. Free terminal/POS equipment available with approved merchant account and eligible setup. Customer-pay / zero-cost processing programs are subject to program requirements and applicable laws and card-brand rules. Brand logos shown are associated with Global Payments infrastructure and do not imply endorsement of Process.Direct.</p>
        </div>
      </main>

      {/* ── Mobile sticky CTA button ─────────────────────────────────────────── */}
      {!accepted && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-4 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <button
            onClick={() => setSheetOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-base py-4 rounded-xl transition-all"
          >
            Get Started →
          </button>
          <p className="text-center text-xs text-gray-500 mt-2">
            No obligation until you review and sign.
          </p>
        </div>
      )}

      {/* ── Mobile bottom sheet ──────────────────────────────────────────────── */}
      {sheetOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setSheetOpen(false)}
          />
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-0">
            <div className="relative">
              <CreditCardBadge />
              <div
                className="relative bg-[#F5FAFF] border-t border-x border-blue-100 rounded-t-[22px] shadow-2xl px-5 pt-11 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              >
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1.5"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
                <CtaSection
                  accepted={accepted}
                  loading={loading}
                  errors={errors}
                  name={name}   setName={setName}
                  email={email} setEmail={setEmail}
                  phone={phone} setPhone={setPhone}
                  selectedPlanName={selectedPlanName}
                  cardSales={cardSales}
                  monthlySavings={monthlySavings}
                  yearlySavings={yearlySavings}
                  selectedOption={selectedOption}
                  paymentAcceptance={paymentAcceptance}
                  setPaymentAcceptance={setPaymentAcceptance}
                  chrome={false}
                  onAccept={async () => {
                    await handleAccept()
                    setSheetOpen(false)
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CreditCardBadge() {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -top-7 md:-top-8 z-10 flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#EAF4FF] border border-blue-200 shadow-[0_4px_14px_rgba(37,99,235,0.12)]"
      aria-hidden
    >
      <CreditCard className="w-6 h-6 md:w-7 md:h-7 text-blue-600" strokeWidth={1.75} />
    </div>
  )
}

// ─── CTA section (shared desktop + bottom-sheet) ──────────────────────────────

function CtaSection({
  accepted, loading, errors,
  name, setName, email, setEmail, phone, setPhone,
  selectedPlanName, cardSales, monthlySavings, yearlySavings, selectedOption: _selectedOption,
  paymentAcceptance, setPaymentAcceptance,
  onAccept,
  chrome = true,
}: {
  accepted:         boolean
  loading:          boolean
  errors:           Record<string, string>
  name:             string;  setName:  (v: string) => void
  email:            string;  setEmail: (v: string) => void
  phone:            string;  setPhone: (v: string) => void
  selectedPlanName: string
  cardSales:        number
  monthlySavings:   number
  yearlySavings:    number
  selectedOption:   'wholesale' | 'customer_pay'
  paymentAcceptance: PaymentAcceptance | null
  setPaymentAcceptance: (v: PaymentAcceptance) => void
  onAccept:         () => void
  chrome?:          boolean
}) {
  function fmtD(n: number) { return '$' + Math.round(n).toLocaleString() }

  if (accepted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-[20px] px-6 py-8 text-center">
        <span className="text-3xl font-black text-green-600 block mb-2">✓ Proposal Accepted</span>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          Thanks! We&apos;ll send your Service Agreement so we can get your account set up.
        </p>
        <p className="text-xs text-gray-400 mt-2">Selected plan: {selectedPlanName}</p>
        <p className="text-xs text-gray-400 mt-1">Expected card sales: {fmtD(cardSales)}/month</p>
      </div>
    )
  }

  const wrapCls = (field: string) =>
    `flex items-center gap-2.5 bg-white rounded-full border px-4 py-3 transition focus-within:ring-2 focus-within:ring-blue-500 ${
      errors[field] ? 'border-red-400' : 'border-gray-200'
    }`
  const inputCls =
    'flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent focus:outline-none'

  return (
    <div
      className={
        chrome
          ? 'bg-[#F5FAFF] border border-blue-100 rounded-[20px] px-5 md:px-6 pt-8 pb-6 space-y-3.5'
          : 'space-y-3.5'
      }
    >
      <h2 className="text-[22px] md:text-[26px] font-extrabold text-[#0B1B33] text-center tracking-tight leading-tight">
        Ready to Get Started?
      </h2>

      <div className="flex flex-col items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600">
            <Check size={10} strokeWidth={3} />
          </span>
          Selected plan: {selectedPlanName}
        </span>
        <p className="text-[11px] md:text-xs text-slate-400 text-center leading-relaxed">
          Expected card sales: {fmtD(cardSales)}/month
          {' · '}
          <span className="text-green-600 font-medium">
            Est. savings {fmtD(monthlySavings)}/mo · {fmtD(yearlySavings)}/yr
          </span>
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-[#0B1B33] text-center mb-2">
          How do you want to accept payments?
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_ACCEPTANCE_OPTIONS.map(opt => {
            const selected = paymentAcceptance === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPaymentAcceptance(opt.value)}
                className={`rounded-xl border px-2 py-2.5 text-[11px] sm:text-xs font-semibold leading-tight text-center transition-colors ${
                  selected
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : errors.paymentAcceptance
                      ? 'bg-white border-red-300 text-slate-700'
                      : 'bg-white border-gray-200 text-slate-700 hover:border-blue-300'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-1.5">
          We&apos;ll recommend the right setup for your business.
        </p>
        {errors.paymentAcceptance && (
          <p className="mt-1 text-xs text-red-500 text-center">{errors.paymentAcceptance}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className={wrapCls('name')}>
            <User size={16} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={e => setName(e.target.value)}
              className={inputCls}
              autoComplete="name"
            />
          </div>
          {errors.name && <p className="mt-1 text-xs text-red-500 px-2">{errors.name}</p>}
        </div>
        <div>
          <div className={wrapCls('email')}>
            <Mail size={16} className="text-slate-400 shrink-0" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls}
              autoComplete="email"
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-red-500 px-2">{errors.email}</p>}
        </div>
      </div>

      <div>
        <div className={wrapCls('phone')}>
          <PhoneIcon size={16} className="text-slate-400 shrink-0" />
          <input
            type="tel"
            placeholder="Phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className={inputCls}
            autoComplete="tel"
          />
        </div>
        {errors.phone && <p className="mt-1 text-xs text-red-500 px-2">{errors.phone}</p>}
      </div>

      {errors.form && (
        <p className="text-center text-sm text-red-600">{errors.form}</p>
      )}

      <p className="text-center text-xs text-slate-500 leading-relaxed">
        We&apos;ll send you a Service Agreement and help choose the right payment setup.
      </p>

      <button
        type="button"
        onClick={onAccept}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-base py-3.5 rounded-xl transition-colors"
      >
        {loading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Sending…
          </>
        ) : (
          'Get Started →'
        )}
      </button>

      <div className="space-y-1">
        <p className="text-center text-xs text-slate-600 font-medium">
          No obligation until you review and sign.
        </p>
        <p className="text-center text-[11px] text-slate-400">
          🔒 Your information is secure and will only be used to process this proposal.
        </p>
      </div>
    </div>
  )
}
