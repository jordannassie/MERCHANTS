'use client'

import { CheckCircle2, Minus, ArrowRight } from 'lucide-react'

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
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
            Why Businesses Choose Process.Direct
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
                  <div className="flex flex-col gap-1.5">
                    <span className="inline-flex w-fit items-center bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
                      Best for Local Business
                    </span>
                    <span className="text-base font-bold text-slate-900">Process.Direct</span>
                  </div>
                </th>
                {/* Competitors */}
                {['Clover', 'Toast', 'Stripe'].map(name => (
                  <th key={name} className="px-5 py-4 text-base font-semibold text-slate-500">
                    {name}
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
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-green-700">Process.Direct</span>
                  <span className="text-[10px] bg-green-500 text-white font-bold px-2 py-0.5 rounded-full">Best</span>
                </div>
                <PdCell text={row.pd} />
              </div>
              {/* Competitors */}
              {[
                { name: 'Clover', text: row.clover },
                { name: 'Toast',  text: row.toast  },
                { name: 'Stripe', text: row.stripe  },
              ].map(({ name, text }) => (
                <div key={name} className="px-4 py-3 border-b border-slate-50 last:border-0">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">{name}</span>
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
