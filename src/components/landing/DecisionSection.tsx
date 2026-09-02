'use client'

import {
  Monitor, CreditCard, ArrowRight,
  Calendar, Package, Zap, Headphones, User, DollarSign,
} from 'lucide-react'

const BENEFITS = [
  {
    icon: Calendar,
    title: 'Month-to-Month Agreement',
    body: 'No long-term contract holding your business back.',
  },
  {
    icon: Package,
    title: 'Free Equipment Options',
    body: 'Equipment options available at no upfront cost, except certain third-party POS systems.',
  },
  {
    icon: Zap,
    title: 'Fast Savings Review',
    body: 'Share a recent processing statement and receive a clear savings proposal in about 15 minutes.',
  },
  {
    icon: Headphones,
    title: 'U.S.-Based Support',
    body: 'Get help from a support team based in the United States.',
  },
  {
    icon: User,
    title: 'A Real Person to Call',
    body: 'Work directly with Jordan — not just an 800 number or a different agent every time.',
  },
  {
    icon: DollarSign,
    title: 'Predictable Pricing',
    body: 'Clear pricing built to avoid surprise rate increases.',
  },
]

interface Props {
  onNewBusiness: () => void
  onExistingBusiness: () => void
  onTalkWithJordan: () => void
}

export function DecisionSection({ onNewBusiness, onExistingBusiness, onTalkWithJordan }: Props) {
  return (
    <>
      {/* ── Decision cards ────────────────────────────────────────────────── */}
      <section className="bg-white py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Eyebrow + headline */}
          <div className="text-center mb-10">
            <p className="text-xs font-bold tracking-widest text-blue-600 uppercase mb-3">
              New Business or Existing Business?
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              Find the Right Payment Setup for Your Business.
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Whether you are opening your doors or already accepting cards, we'll help you choose
              the right setup — without pressure or confusing jargon.
            </p>
          </div>

          {/* Two cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: New Business */}
            <div className="group bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all flex flex-col">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-blue-100 transition-colors">
                <Monitor size={22} className="text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">I'm Opening a Business</h3>
              <p className="text-slate-500 text-sm leading-relaxed flex-1 mb-6">
                Get a simple payment setup built around how you sell — in person, online,
                mobile, or at the counter.
              </p>
              <button
                onClick={onNewBusiness}
                className="inline-flex items-center gap-2 text-blue-600 font-semibold text-sm hover:gap-3 transition-all"
              >
                Explore POS &amp; Equipment <ArrowRight size={15} />
              </button>
            </div>

            {/* Card 2: Existing Business */}
            <div className="group bg-blue-600 border border-blue-600 rounded-2xl p-8 shadow-sm hover:shadow-xl hover:bg-blue-700 transition-all flex flex-col">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-5">
                <CreditCard size={22} className="text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">I Already Accept Cards</h3>
              <p className="text-blue-100 text-sm leading-relaxed flex-1 mb-6">
                Send a recent processing statement and get a clear savings proposal
                in about 15 minutes.
              </p>
              <button
                onClick={onExistingBusiness}
                className="inline-flex items-center gap-2 text-white font-semibold text-sm hover:gap-3 transition-all"
              >
                Get My Free Review <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Process.Direct benefits ───────────────────────────────────── */}
      <section className="bg-slate-50 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-widest text-blue-600 uppercase mb-3">
              Why Process.Direct
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              Straightforward Payments. Real Support.
            </h2>
          </div>

          {/* 3-col benefit grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md hover:border-blue-100 transition-all"
              >
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                  <Icon size={18} className="text-blue-600" />
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1.5">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          {/* Trust bar */}
          <div className="mt-10 py-4 px-6 bg-white rounded-2xl border border-slate-100 shadow-sm text-center">
            <p className="text-slate-500 text-sm font-medium">
              20 years of combined industry experience
              <span className="mx-3 text-slate-300">•</span>
              Supporting more than $4.5B in annual transactions
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <p className="text-xl font-bold text-slate-900 mb-2">Not Sure What You Need?</p>
            <p className="text-slate-500 text-sm mb-6">
              Tell us how you sell, and we'll help you find the simplest setup.
            </p>
            <button
              onClick={onTalkWithJordan}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-base px-8 py-4 rounded-xl shadow-lg transition-all"
            >
              Talk With Jordan <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
