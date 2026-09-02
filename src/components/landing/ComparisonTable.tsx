'use client'

import Image from 'next/image'
import { CheckCircle2, Minus, ArrowRight } from 'lucide-react'

const LOGOS = {
  pd:     { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png',                                            alt: 'Process.Direct',  w: 110, h: 28 },
  clover: { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/clover.svg',                                                     alt: 'Clover',          w: 80,  h: 24 },
  toast:  { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Toasts.png',                                                     alt: 'Toast',           w: 80,  h: 28 },
  stripe: { src: 'https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Stripe_Logo,_revised_2016.svg.webp', alt: 'Stripe',          w: 70,  h: 28 },
}

const ROWS = [
  {
    label: 'Personal setup & support',
    pd:     'Direct help from a real person',
    clover: 'Depends on provider',
    toast:  'Great restaurant onboarding',
    stripe: 'Built for self-service',
  },
  {
    label: 'Built for your business',
    pd:     'Retail, service, mobile, restaurant & more',
    clover: 'Clover-focused ecosystem',
    toast:  'Restaurant-focused',
    stripe: 'Best for online businesses',
  },
  {
    label: 'Payment hardware options',
    pd:     'Multiple terminal and POS options',
    clover: 'Clover hardware',
    toast:  'Toast hardware',
    stripe: 'Limited in-person hardware',
  },
  {
    label: 'Payment-cost review',
    pd:     'We help review your current processing costs',
    clover: 'Varies by reseller',
    toast:  'Pricing can be complex',
    stripe: 'Standard published pricing',
  },
  {
    label: 'Easy to reach',
    pd:     'Call, text, or email a real person',
    clover: 'Varies by provider',
    toast:  'Support queues',
    stripe: 'Online support first',
  },
  {
    label: 'Custom solution',
    pd:     'Built around your business needs',
    clover: 'Limited to Clover ecosystem',
    toast:  'Limited to Toast ecosystem',
    stripe: 'Flexible, but may require development',
  },
]

function PdCell({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />
      <span className="text-sm font-medium text-slate-800">{text}</span>
    </div>
  )
}

function CompCell({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Minus size={14} className="text-slate-300 shrink-0 mt-0.5" />
      <span className="text-sm text-slate-500">{text}</span>
    </div>
  )
}

export function ComparisonTable({ onScrollToContact }: { onScrollToContact: () => void }) {
  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Heading */}
        <div className="text-center mb-12">
          <h2 id="why" className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
            Why are are the Best?
          </h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            The technology matters. But having a real person in your corner matters more.
          </p>
        </div>

        {/* ── DESKTOP TABLE ── */}
        <div className="hidden md:block rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-white border-b border-slate-100">
                {/* What matters */}
                <th className="px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wide w-[22%]">
                  What Matters
                </th>
                {/* Process.Direct */}
                <th className="px-5 py-4 w-[26%] bg-green-50 border-x border-green-100">
                  <div className="flex flex-col gap-2">
                    <span className="inline-flex w-fit items-center bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
                      Best for Local Business
                    </span>
    <Image src={LOGOS.pd.src} alt={LOGOS.pd.alt} width={LOGOS.pd.w*2} height={LOGOS.pd.h*2} className="h-14 w-auto object-contain" />
                  </div>
                </th>
                {/* Competitors */}
                {(['clover','toast','stripe'] as const).map(key => (
                  <th key={key} className="px-5 py-4">
                    <Image src={LOGOS[key].src} alt={LOGOS[key].alt} width={LOGOS[key].w} height={LOGOS[key].h} className="h-6 w-auto object-contain" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
                >
                  <td className="px-5 py-4 text-sm font-semibold text-slate-700 border-r border-slate-100">
                    {row.label}
                  </td>
                  <td className="px-5 py-4 bg-green-50/60 border-x border-green-100">
                    <PdCell text={row.pd} />
                  </td>
                  <td className="px-5 py-4 border-r border-slate-100">
                    <CompCell text={row.clover} />
                  </td>
                  <td className="px-5 py-4 border-r border-slate-100">
                    <CompCell text={row.toast} />
                  </td>
                  <td className="px-5 py-4">
                    <CompCell text={row.stripe} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── MOBILE CARDS ── */}
        <div className="md:hidden space-y-4">
          {ROWS.map(row => (
            <div key={row.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Row label */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{row.label}</span>
              </div>
              {/* Process.Direct */}
              <div className="px-4 py-3 bg-green-50 border-b border-green-100">
                <div className="flex items-center justify-between mb-2">
                  <Image src={LOGOS.pd.src} alt={LOGOS.pd.alt} width={90} height={22} className="h-5 w-auto object-contain" />
                  <span className="text-[10px] bg-green-500 text-white font-bold px-2 py-0.5 rounded-full">Best</span>
                </div>
                <PdCell text={row.pd} />
              </div>
              {/* Competitors */}
              {([
                { key: 'clover' as const, text: row.clover },
                { key: 'toast'  as const, text: row.toast  },
                { key: 'stripe' as const, text: row.stripe  },
              ]).map(({ key, text }) => (
                <div key={key} className="px-4 py-3 border-b border-slate-50 last:border-0">
                  <Image src={LOGOS[key].src} alt={LOGOS[key].alt} width={60} height={18} className="h-4 w-auto object-contain mb-1.5" />
                  <CompCell text={text} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-xl font-bold text-slate-900 mb-5">
            Get a payment setup built for your business.
          </p>
          <button
            onClick={onScrollToContact}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base px-8 py-4 rounded-xl shadow-lg shadow-blue-200 transition-all"
          >
            See Your Options <ArrowRight size={16} />
          </button>
        </div>

        {/* Disclaimer */}
        <p className="mt-8 text-center text-[11px] text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Feature availability, pricing, and support experiences may vary by plan, provider, and location.
          Brand names are used for comparison purposes only.
        </p>
      </div>
    </section>
  )
}
