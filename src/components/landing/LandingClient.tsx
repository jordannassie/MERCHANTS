'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  ChevronRight, Play, Shield, ArrowRight,
  CheckCircle, Phone, Mail, LogIn, LifeBuoy,
} from 'lucide-react'
import { PinDialog } from './PinDialog'
import { ComparisonTable } from './ComparisonTable'
import { DecisionSection } from './DecisionSection'
import { DecisionCards } from './DecisionCards'

  const NAV_LINKS = [
    { label: 'Savings', href: '#why' },
    { label: 'About', href: '#about' },
    { label: 'Contact', href: '#contact' },
  ]

const LOGO_URL = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png'
const JORDAN_PHOTO = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Jordanimage.png'
const IMG_CLOVER = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Clover-Restaurant-Devices-1-900x464.webp'
const IMG_TYPES = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/different-type-cover_image.jpg'
const IMG_DEVICE = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/H479a5103a8714372ada840a8ca05057dr.png_300x300.avif'



const EMPTY_FORM = { firstName: '', lastName: '', phone: '', email: '', comments: '', subject: '', inquiry_type: '' }

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

  function scrollToContactWithInquiry(inquiry: string) {
    setForm(f => ({ ...f, inquiry_type: inquiry, subject: inquiry, comments: inquiry ? `I'm interested in: ${inquiry}` : f.comments }))
    setSubmitted(false)
    setTimeout(() => document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' }), 50)
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
      <section className="relative bg-white overflow-hidden">
        {/* Full-width hero image fading to white */}
        <div className="relative w-full" style={{ height: '520px' }}>
          <Image
            src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/coffe.png"
            alt="Café payment counter"
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
          {/* Gradient fade to white at the bottom */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, rgba(255,255,255,0) 30%, rgba(255,255,255,0.7) 70%, #ffffff 100%)',
            }}
          />
        </div>

        {/* Hero text content — sits below the image, on white */}
        <div className="relative bg-white pb-20 md:pb-28">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Tap%20clear.png"
              alt="Tap"
              width={420}
              height={120}
              className="h-[120px] w-auto object-contain"
            />
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.08] mb-6">
            Save More on<br className="hidden sm:block" /> Every Sale.
          </h1>

            <p className="max-w-2xl mx-auto text-xl md:text-2xl text-slate-500 leading-relaxed mb-10">
              We help businesses lower payment-processing costs and get the right
              payment equipment for the way they sell.
            </p>

          <DecisionCards
            onNewBusiness={() => scrollToContactWithInquiry("I'm opening a new business")}
            onExistingBusiness={() => scrollToContactWithInquiry("I already accept cards — review my rates")}
          />

            {/* Trust indicators */}
            <div className="mt-12 flex flex-wrap justify-center gap-6 text-xs text-slate-400 font-medium">
              {['No pressure', 'No jargon', 'Free initial review', 'Texas-based'].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle size={11} className="text-blue-400" /> {t}
                </span>
              ))}
            </div>

            {/* Accepted cards */}
            <div className="mt-10 flex justify-center">
              <Image
                src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Cards.png"
                alt="Accepted: Amex, Visa, Mastercard, Discover"
                width={320}
                height={60}
                className="h-12 w-auto object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── QUICKBOOKS STRIP ───────────────────────────────────────────────── */}
      {/* ─── TRUST STATS (full-width) ────────────────────────────────────────── */}
     <section className="w-full bg-blue-50/40 py-12">
       <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="text-center mb-4 text-sm text-slate-700">Experience you can count on.</div>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
           <div className="flex items-center justify-center md:justify-end">
             <div className="bg-white rounded-2xl p-8 w-full max-w-md text-center md:text-right">
              <div className="text-6xl font-extrabold text-slate-900">20+</div>
               <div className="mt-2 text-sm text-slate-600">Years of Combined Payment Industry Experience</div>
             </div>
           </div>
           <div className="flex items-center justify-center md:justify-start">
             <div className="bg-white rounded-2xl p-8 w-full max-w-md text-center md:text-left">
              <div className="text-6xl font-extrabold text-slate-900">$4.5B+</div>
               <div className="mt-2 text-sm text-slate-600">In Annual Transactions Supported</div>
             </div>
           </div>
         </div>
       </div>
     </section>

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

      {/* ─── DECISION + BENEFITS ────────────────────────────────────────────── */}
      <DecisionSection
        onNewBusiness={() => scrollToContactWithInquiry("I'm opening a new business")}
        onExistingBusiness={() => scrollToContactWithInquiry("I already accept cards — review my rates")}
        onTalkWithJordan={() => scrollToContactWithInquiry('')}
      />

      {/* ─── VIDEO SECTION ──────────────────────────────────────────────────── */}
      <section id="video" className="bg-white py-20 md:py-28">
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

      {/* ─── COMPARISON TABLE ───────────────────────────────────────────────── */}
      <ComparisonTable onScrollToContact={() => scrollTo('#contact')} />

      {/* ─── IMAGE GALLERY ──────────────────────────────────────────────────── */}
      <section className="bg-white py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
          <div className="relative rounded-2xl overflow-hidden shadow-md w-full" style={{ height: '420px' }}>
            <Image
              src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Terms.png"
              alt="Payment terminals lineup"
              fill
              className="object-cover object-center"
              sizes="100vw"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="relative rounded-2xl overflow-hidden shadow-md" style={{ height: '300px' }}>
              <Image src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Coffeee.png" alt="Café checkout" fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
            </div>
            <div className="relative rounded-2xl overflow-hidden shadow-md" style={{ height: '300px' }}>
              <Image
                src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/POS.png"
                alt="POS hardware lineup"
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
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
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3">
                Jordan Nassie
              </h2>

              {/* Jordan's promise */}
              <blockquote className="mb-5 border-l-4 border-blue-500 pl-4 text-slate-600 italic text-base leading-relaxed">
                "Let me help you save money and give you excellent support."
                <footer className="mt-1 text-xs not-italic font-semibold text-slate-400">— Jordan Nassie</footer>
              </blockquote>

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
                <Shield size={12} /> Simple. Personal. Built for your business.
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight mb-4">
                Let’s Find the Right Payment Setup
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed mb-8">
                Tell us what your business needs. We’ll reach out with a straightforward recommendation—whether you’re opening, upgrading equipment, or reviewing your current payment costs.
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
                  {/* Pre-selected subject badge */}
                  {form.subject && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <span className="text-xs font-semibold text-blue-700">{form.subject}</span>
                      <button type="button" onClick={() => setForm(f => ({ ...f, subject: '', comments: '' }))} className="ml-auto text-blue-400 hover:text-blue-600 text-xs">✕</button>
                    </div>
                  )}
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

                  {/* Inquiry dropdown (required) */ }
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">What can we help with? <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={form.inquiry_type}
                      onChange={e => setForm(f => ({ ...f, inquiry_type: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select an option</option>
                      <option>I'm opening a new business</option>
                      <option>I need a POS system or payment terminal</option>
                      <option>I already accept cards — review my rates</option>
                      <option>I want to switch payment providers</option>
                      <option>I need help with online payments</option>
                      <option>Something else</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Anything else you'd like us to know? (Optional)
                    </label>
                    <textarea
                      rows={4}
                      value={form.comments}
                      onChange={e => setForm(f => ({ ...f, comments: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      placeholder="Tell us a little about your business or what you need."
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
                    {submitting ? 'Sending…' : 'Get My Recommendation'}
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
              <a
                href="https://agentportal.tsys.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-700 transition-colors font-medium"
              >
                Agent Portal
              </a>
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
  const videoRef = useRef<HTMLVideoElement>(null)

  const VIDEO_SRC = 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/video/vss.mp4'

  function handlePlayClick() {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    v.loop = false
    v.controls = true
    v.play()
    setPlaying(true)
  }

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-slate-900 cursor-pointer"
      style={{ aspectRatio: '16/9' }}
      onClick={!playing ? handlePlayClick : undefined}
    >
      {/* Video — autoplays muted+loop as background; becomes full player on click */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="w-full h-full object-cover"
        onPlay={() => {}}
        onPause={() => setPlaying(false)}
        aria-label="How Process.Direct works"
      >
        <track kind="captions" />
      </video>

      {/* Play button overlay — hidden once user clicks play */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
          <div className="w-20 h-20 rounded-full bg-white/90 shadow-xl flex items-center justify-center">
            <Play size={30} className="text-blue-600 fill-blue-600 ml-1" />
          </div>
        </div>
      )}
    </div>
  )
}
