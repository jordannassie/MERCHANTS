'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function GtpFormClient() {
  const [form, setForm] = useState({
    full_name: '',
    business_name: '',
    phone: '',
    city: '',
    industry: '',
    payment_need: '',
    opening_timeline: '',
    sms_consent: false,
    honeypot: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: any) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/gtp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-[200px] flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold mb-4">You’re All Set!</h1>
        <p className="mb-6">We received your information. Jordan will review your business and contact you shortly.</p>
        <div className="flex gap-3">
          <a href="tel:+19497361560" className="px-4 py-2 bg-white border border-slate-200 rounded">Call Jordan</a>
          <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded">Return to Process.Direct</Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-6">
      <h3 className="text-lg font-bold mb-2">Get Your Free Setup Plan</h3>
      <p className="text-sm text-slate-500 mb-4">Tell us a little about your business. Jordan will personally review your information and contact you with the best next step.</p>
      <label className="block text-xs font-medium">Full name *</label>
      <input required value={form.full_name} onChange={e=>setForm({...form, full_name:e.target.value})} className="w-full mb-3" />
      <label className="block text-xs font-medium">Business name *</label>
      <input required value={form.business_name} onChange={e=>setForm({...form, business_name:e.target.value})} className="w-full mb-3" />
      <label className="block text-xs font-medium">Mobile phone *</label>
      <input required value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} className="w-full mb-3" />
      <label className="block text-xs font-medium">City *</label>
      <input required value={form.city} onChange={e=>setForm({...form, city:e.target.value})} className="w-full mb-3" />
      <label className="block text-xs font-medium">Industry *</label>
      <select required value={form.industry} onChange={e=>setForm({...form, industry:e.target.value})} className="w-full mb-3">
        <option value="">Select industry</option>
        <option>Restaurant / Bar</option>
        <option>Retail</option>
        <option>Salon / Spa / Barber</option>
        <option>Medical / Dental</option>
        <option>Auto / Repair</option>
        <option>Home Services</option>
        <option>Professional Services</option>
        <option>Ecommerce</option>
        <option>Other</option>
      </select>
      <label className="block text-xs font-medium">What do you need? *</label>
      <select required value={form.payment_need} onChange={e=>setForm({...form, payment_need:e.target.value})} className="w-full mb-3">
        <option value="">Select</option>
        <option>POS system</option>
        <option>Card processing</option>
        <option>Both</option>
        <option>Not sure yet</option>
      </select>
      <label className="block text-xs font-medium">When are you opening? *</label>
      <select required value={form.opening_timeline} onChange={e=>setForm({...form, opening_timeline:e.target.value})} className="w-full mb-3">
        <option value="">Select</option>
        <option>Already open</option>
        <option>Within 30 days</option>
        <option>1–3 months</option>
        <option>More than 3 months</option>
        <option>Just planning</option>
      </select>
      <input type="text" name="honeypot" value={form.honeypot} onChange={e=>setForm({...form, honeypot:e.target.value})} style={{display:'none'}} />
      <label className="flex items-start gap-2 text-sm mb-4">
        <input required type="checkbox" checked={form.sms_consent} onChange={e=>setForm({...form, sms_consent:e.target.checked})} />
        <span>I agree to receive calls and automated text messages from Process.Direct regarding my payment setup. Consent is not required to purchase. Message and data rates may apply. Reply STOP to opt out.</span>
      </label>
      {error && <div className="text-red-600 mb-3">{error}</div>}
      <button disabled={submitting} className="w-full bg-blue-600 text-white py-3 rounded">{submitting ? 'Creating Your Plan…' : 'Get My Free Setup Plan'}</button>
      <p className="text-xs text-slate-500 mt-3">Free consultation. No obligation.</p>
    </form>
  )
}

