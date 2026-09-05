import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Opening a Business in Texas? | Process.Direct',
  description: 'Find the right POS and payment system before opening day. Get a free setup plan from Process.Direct.',
  openGraph: {
    title: 'Opening a Business in Texas? | Process.Direct',
    description: 'Find the right POS and payment system before opening day. Get a free setup plan from Process.Direct.',
  },
  robots: { index: true, follow: true },
}

import GtpFormClient from '@/components/gtp/GtpFormClient'

export default function GtpPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center justify-between max-w-6xl mx-auto p-6">
        <Image src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/logos/Blacklogo.png" alt="Process.Direct" width={160} height={48} />
        <a href="tel:+19497361560" className="text-sm text-blue-600">Call Jordan</a>
      </header>

      <section className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8 p-6 items-start">
        <div>
          <h1 className="text-4xl font-extrabold mb-4">Opening a Business in Texas?</h1>
          <h2 className="text-xl text-slate-600 mb-4">Find the right POS and payment system before opening day.</h2>
          <p className="text-slate-500 mb-6">Tell us about your business and we’ll recommend a simple payment setup based on what you need. No pressure and no obligation.</p>
          <ul className="grid grid-cols-1 gap-2 text-sm text-slate-600">
            <li>• Month-to-month options</li>
            <li>• Free equipment options for qualified businesses</li>
            <li>• Local Texas setup help</li>
          </ul>
        </div>
        <div>
          <GtpFormClient />
        </div>
      </section>

      <section className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div>
            <div className="font-bold">1</div>
            <div>Tell us about your business</div>
          </div>
          <div>
            <div className="font-bold">2</div>
            <div>We review your POS and payment needs</div>
          </div>
          <div>
            <div className="font-bold">3</div>
            <div>Jordan contacts you with a simple recommendation</div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto p-6">
        <div className="flex gap-6 items-center">
          <Image src="https://phhczohqidgrvcmszets.supabase.co/storage/v1/object/public/MERCHANT/images/images/Jordanimage.png" alt="Jordan" width={120} height={120} className="rounded-lg" />
          <div>
            <h3 className="font-bold">Local Help—Not Another 800 Number</h3>
            <p className="text-slate-600">I’m Jordan, your local Process.Direct representative in North Texas. I’ll help you compare the available options, get set up and stay supported after your business starts processing payments.</p>
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto p-6 text-xs text-slate-500">
        <div><Link href="/privacy">Privacy Policy</Link> • <Link href="/terms">Terms</Link></div>
        <p className="mt-2">Process.Direct is an independent sales representative of Hawthorne Payments, LLC, a registered ISO of PNC Bank, N.A., Pittsburgh, PA. Products, pricing, equipment offers and merchant accounts are subject to availability, underwriting approval and applicable agreements.</p>
      </footer>
    </main>
  )
}

