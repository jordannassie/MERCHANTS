'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  ChevronRight, Play, Shield, ArrowRight,
  BarChart2, CheckCircle, CreditCard, Phone, Mail, LogIn, LifeBuoy,
} from 'lucide-react'
import { PinDialog } from './PinDialog'

const NAV_LINKS = [
  { label: 'Savings', href: '#savings' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

const LOGO_URL = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Process%20logo.png'
const JORDAN_PHOTO = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Jordanimage.png'
const IMG_CLOVER = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Clover-Restaurant-Devices-1-900x464.webp'
const IMG_TYPES = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/different-type-cover_image.jpg'
const IMG_DEVICE = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/H479a5103a8714372ada840a8ca05057dr.png_300x300.avif'

const SAVINGS_CARDS = [
  {
    icon: BarChart2,
    title: 'Review Your Current Costs',
    body: 'We examine your current processing setup and identify unnecessary fees and charges that can be reduced or eliminated.',
  },
  {
    icon: CreditCard,
    title: 'Compare Better Options',
    body: 'We help you compare pricing and equipment options side by side — without confusing technical language or pressure.',
  },
  {
    icon: CheckCircle,
    title: 'Start Taking Payments',
    body: 'Get the payment equipment and ongoing support your business needs to operate confidently from day one.',
  },
]


const EMPTY_FORM = { firstName: '', lastName: '', phone: '', email: '', comments: '' }

export default function LandingClient() {
  const searchParams = useSearchParams()
  const [pinOpen, setPinOpen] = useState(() => searchParams.get('login') === '1')
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function scrollTo(href: string) {
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Submission failed')
      setSubmitted(true)
      setForm(EMPTY_FORM)
    } catch {
      setSubmitError('Something went wrong. Please try again or call us directly.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">

      {/* ─── UTILITY TOP BAR ────────────────────────────────────────────────── */}
      <div className="bg-slate-800 text-slate-300 text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-end gap-3">
          <button
            onClick={() => scrollTo('#contact')}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <LifeBuoy size={11} /> Support Request
          </button>
          <span className="text-slate-600">|</span>
          <a
            href="https://www.mystorecentral.com/auth/login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <LogIn size={11} /> Customer Login
          </a>
        </div>
      </div>

      {/* ─── STICKY HEADER ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image src={LOGO_URL} alt="Process.Direct" width={140} height={36} className="h-9 w-auto object-contain" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map(({ label, href }) => (
              <button
                key={label}
                onClick={() => scrollTo(href)}
                className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Right CTA */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => scrollTo('#contact')}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Request a Free Review <ChevronRight size={14} />
            </button>
          </div>

          {/* Mobile CTA */}
          <button
            onClick={() => scrollTo('#contact')}
            className="md:hidden text-sm font-semibold text-blue-600"
          >
            Get started
          </button>
        </div>
      </header>

      {/* ─── HERO ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pt-20 pb-28 md:pt-28 md:pb-36">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at 70% 40%, rgba(59,130,246,0.07) 0%, transparent 60%)',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <Shield size={12} /> Helping Texas businesses reduce processing costs
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.08] mb-6">
            Keep More of<br className="hidden sm:block" /> Every Sale.
          </h1>

          <p className="max-w-2xl mx-auto text-xl md:text-2xl text-slate-500 leading-relaxed mb-10">
            We help businesses lower payment-processing costs and get the right
            payment equipment for the way they sell.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => scrollTo('#contact')}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base px-8 py-4 rounded-xl shadow-lg shadow-blue-200 transition-all"
            >
              Request a Free Review <ArrowRight size={16} />
            </button>
            <button
              onClick={() => scrollTo('#video')}
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-base px-8 py-4 rounded-xl border border-slate-200 transition-all"
            >
              <Play size={14} className="fill-slate-700" /> Watch How It Works
            </button>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap justify-center gap-6 text-xs text-slate-400 font-medium">
            {['No pressure', 'No jargon', 'Free initial review', 'Texas-based'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle size={11} className="text-blue-400" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── VIDEO SECTION ──────────────────────────────────────────────────── */}
      <section id="video" className="bg-slate-50 py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              See How We Help You Save
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              A quick look at how better payment processing can reduce unnecessary fees
              and simplify the way your business gets paid.
            </p>
          </div>
          <VideoPlaceholder />
        </div>
      </section>

      {/* ─── SAVINGS CARDS ──────────────────────────────────────────────────── */}
      <section id="savings" className="bg-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Small Processing Changes Can Create Real Savings.
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Most businesses are overpaying for payment processing without realising it.
              Here is how we help.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SAVINGS_CARDS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="bg-white border border-slate-100 rounded-2xl p-7 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center mb-5">
                  <Icon size={20} className="text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* ─── FULL-WIDTH IMAGE 1 ──────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden" style={{ height: '480px' }}>
        <Image src={IMG_CLOVER} alt="Clover restaurant payment devices" fill className="object-cover" sizes="100vw" />
      </section>

      {/* ─── FULL-WIDTH IMAGE 2 ──────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden" style={{ height: '480px' }}>
        <Image src={IMG_TYPES} alt="Different payment types accepted" fill className="object-cover" sizes="100vw" />
      </section>

      {/* ─── FULL-WIDTH IMAGE 3 ──────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden" style={{ height: '480px' }}>
        <Image src={IMG_DEVICE} alt="Payment terminal close-up" fill className="object-cover object-center" sizes="100vw" />
      </section>

      {/* ─── QUICKBOOKS STRIP ───────────────────────────────────────────────── */}
      <section className="bg-white border-y border-slate-100 py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-center gap-5">
          <Image
            src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/quickbooks.png"
            alt="QuickBooks"
            width={160}
            height={44}
            className="h-10 w-auto object-contain"
          />
          <div className="hidden sm:block w-px h-8 bg-slate-200" />
          <p className="text-slate-600 text-sm font-medium text-center sm:text-left">
            Syncs seamlessly with your QuickBooks software — no double entry, no headaches.
          </p>
        </div>
      </section>

      {/* ─── BIO: Jordan Nassie ─────────────────────────────────────────────── */}
      <section id="about" className="bg-white py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center gap-12">
            {/* Photos: Jordan + Texas mural */}
            <div className="shrink-0 flex flex-col sm:flex-row md:flex-col gap-4 items-center">
              <div className="relative w-56 h-56 md:w-64 md:h-64 rounded-2xl overflow-hidden shadow-xl ring-4 ring-blue-50">
                <Image
                  src={JORDAN_PHOTO}
                  alt="Jordan Nassie"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 224px, 256px"
                />
              </div>
              <div className="relative w-56 h-36 md:w-64 md:h-40 rounded-2xl overflow-hidden shadow-lg">
                <Image
                  src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/texas.png"
                  alt="Texas"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 768px) 224px, 256px"
                />
              </div>
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
                <Shield size={12} /> Your Local Payment Expert
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
                Jordan Nassie
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed mb-6">
                Jordan is a Texas-based payment processing specialist dedicated to helping
                local businesses cut unnecessary fees and find the right equipment for the
                way they sell. With hands-on experience across restaurants, retail, and
                service businesses, Jordan delivers honest recommendations — no jargon,
                no pressure, just results.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
                <a
                  href="tel:9493316367"
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-3 rounded-xl transition-colors shadow-md shadow-blue-200"
                >
                  <Phone size={15} /> (949) 331-6367
                </a>
                <a
                  href="mailto:jordannassie@gmail.com"
                  className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm px-5 py-3 rounded-xl transition-colors"
                >
                  <Mail size={15} /> jordannassie@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CONTACT FORM ───────────────────────────────────────────────────── */}
      <section id="contact" className="bg-slate-50 py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">

            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
                <Shield size={12} /> Free — No Obligation
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight mb-4">
                Request a Free Review
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed mb-8">
                A free payment review takes less than 15 minutes. Tell us a little about your business
                and we'll reach out with honest, straightforward recommendations.
              </p>
              <div className="space-y-4 text-sm text-slate-600">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <Phone size={14} className="text-blue-600" />
                  </div>
                  <a href="tel:9493316367" className="hover:text-blue-600 transition-colors font-medium">(949) 331-6367</a>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <Mail size={14} className="text-blue-600" />
                  </div>
                  <a href="mailto:jordannassie@gmail.com" className="hover:text-blue-600 transition-colors font-medium">jordannassie@gmail.com</a>
                </div>
              </div>
            </div>

            {/* Right: form */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
              {submitted ? (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={30} className="text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">We got your request!</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Thanks! Jordan will be in touch soon. For urgent help call{' '}
                    <a href="tel:9493316367" className="text-blue-600 font-semibold">(949) 331-6367</a>.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline transition-colors"
                  >
                    Submit another request
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.firstName}
                        onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Jane"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={form.lastName}
                        onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Smith"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="(555) 000-0000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="jane@yourbusiness.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Comments <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={form.comments}
                      onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      placeholder="How can we help you?"
                    />
                  </div>

                  {submitError && (
                    <p className="text-red-600 text-xs">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-sm py-3.5 rounded-xl transition-colors shadow-md shadow-blue-200"
                  >
                    {submitting ? 'Sending…' : 'Submit Request'}
                  </button>

                  <p className="text-center text-xs text-slate-400">
                    No obligation. We'll reach out within one business day.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-slate-100 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src={LOGO_URL} alt="Process.Direct" width={110} height={28} className="h-7 w-auto object-contain" />
              <span className="text-slate-400 text-xs">© {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-5 text-xs text-slate-400">
              <a href="#" className="hover:text-slate-700 transition-colors">Privacy</a>
              <button
                onClick={() => setPinOpen(true)}
                className="hover:text-slate-600 transition-colors text-xs"
              >
                Admin Login
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-slate-100">
            <Image
              src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/lgoso%20prartner.png"
              alt="Hawthorne Payments"
              width={160}
              height={48}
              className="h-12 w-auto object-contain"
            />
            <p className="text-xs text-slate-400 text-center sm:text-left leading-relaxed">
              Hawthorne Payments, LLC is a registered ISO of PNC Bank, N.A., Pittsburgh, PA
            </p>
          </div>
        </div>
      </footer>

      {/* ─── PIN DIALOG ─────────────────────────────────────────────────────── */}
      <PinDialog open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  )
}

// ─── Isolated video placeholder — swap src/poster when ready ─────────────────
function VideoPlaceholder() {
  const [playing, setPlaying] = useState(false)

  const VIDEO_SRC = ''

  if (!VIDEO_SRC) {
    return (
      <div className="relative w-full rounded-2xl overflow-hidden bg-slate-900 shadow-2xl"
        style={{ aspectRatio: '16/9' }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4 cursor-default">
            <Play size={24} className="text-white fill-white ml-1" />
          </div>
          <p className="text-slate-400 text-sm">Video coming soon</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-slate-900"
      style={{ aspectRatio: '16/9' }}>
      <video
        src={VIDEO_SRC}
        controls
        playsInline
        preload="metadata"
        autoPlay={false}
        className="w-full h-full object-cover"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        aria-label="How Process.Direct works"
      >
        <track kind="captions" />
        Your browser does not support video playback.
      </video>
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
            <Play size={24} className="text-white fill-white ml-1" />
          </div>
        </div>
      )}
    </div>
  )
}
