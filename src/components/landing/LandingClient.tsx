'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Crosshair, ChevronRight, Play, Shield, ArrowRight,
  BarChart2, CheckCircle, CreditCard,
} from 'lucide-react'
import { PinDialog } from './PinDialog'

const NAV_LINKS = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Savings', href: '#savings' },
  { label: 'Contact', href: '#contact' },
]

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

const HOW_STEPS = [
  {
    num: '1',
    title: 'Tell us about your business',
    body: 'Share a few details about how your business operates and what you\'re currently paying for payment processing.',
  },
  {
    num: '2',
    title: 'Review your current processing',
    body: 'We analyse your current setup and identify where costs can be reduced without changing the way you work.',
  },
  {
    num: '3',
    title: 'Receive a straightforward recommendation',
    body: 'Get a clear, honest recommendation with no pressure — a solution that fits your business and your budget.',
  },
]

export default function LandingClient() {
  const searchParams = useSearchParams()
  // Initialize from URL: auto-open dialog when redirected from a protected route (?login=1)
  const [pinOpen, setPinOpen] = useState(() => searchParams.get('login') === '1')

  function scrollTo(href: string) {
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* ─── STICKY HEADER ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Crosshair size={20} className="text-blue-600" />
            <span className="font-bold text-slate-900 text-base">Merchant Radar</span>
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

          {/* CTA */}
          <button
            onClick={() => scrollTo('#contact')}
            className="hidden md:flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            See How Much You Could Save <ChevronRight size={14} />
          </button>

          {/* Mobile menu placeholder — scroll to contact */}
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
        {/* Subtle grid background */}
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
              See How Much You Could Save <ArrowRight size={16} />
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

          {/*
            VIDEO PLACEHOLDER
            Replace the src attribute below with the final video URL.
            The poster attribute can be updated with a thumbnail image URL.
            This component is isolated here for easy replacement.
          */}
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

      {/* ─── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-slate-50 py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              Three simple steps. No commitment required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_STEPS.map(({ num, title, body }) => (
              <div key={num} className="flex flex-col">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-base mb-5 shrink-0">
                  {num}
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ──────────────────────────────────────────────────────── */}
      <section id="contact" className="bg-blue-600 py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to See What You Could Save?
          </h2>
          <p className="text-blue-100 text-lg mb-10 max-w-xl mx-auto">
            A free payment review takes less than 15 minutes and there is no obligation to switch.
          </p>
          <a
            href="mailto:jordan@example.com?subject=Payment%20Review%20Request"
            className="inline-flex items-center gap-2 bg-white hover:bg-blue-50 text-blue-700 font-bold text-base px-8 py-4 rounded-xl shadow-xl transition-all"
          >
            Request a Free Payment Review <ArrowRight size={16} />
          </a>
          <p className="mt-5 text-blue-200 text-xs">
            Or call directly — no bots, no forms, just a conversation.
          </p>
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Crosshair size={15} className="text-blue-500" />
            <span className="text-sm text-slate-300 font-medium">Merchant Radar</span>
            <span className="text-slate-600 text-xs ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-5 text-xs">
            <a href="#" className="hover:text-slate-200 transition-colors">Privacy</a>
            <button
              onClick={() => setPinOpen(true)}
              className="text-slate-600 hover:text-slate-400 transition-colors text-xs"
            >
              Admin Login
            </button>
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

  // Replace VIDEO_SRC with the actual video URL when available
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
        aria-label="How Merchant Radar works"
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
