'use client'

import { useState } from 'react'
import { X, Phone, Copy, Check } from 'lucide-react'
import { fmtPhone } from '@/lib/utils'

interface Props {
  businessName: string
  phone: string | null
  onClose: () => void
}

const RESPONSES = [
  {
    label: 'IF THEY ARE THE DECISION-MAKER',
    text: "\u201cGreat. Have you already selected who you\u2019ll use for credit-card processing and payment equipment?\u201d",
  },
  {
    label: 'IF THEY ALREADY HAVE SOMEONE',
    text: "\u201cUnderstood. Would you be open to a quick comparison before everything is finalized?\u201d",
  },
  {
    label: 'IF THEY NEED TO CALL BACK',
    text: "\u201cNo problem. What day and time would work best for a quick follow-up?\u201d",
  },
  {
    label: 'IF IT IS THE WRONG PERSON',
    text: "\u201cWho would be the best person to speak with, and what is the best way to reach them?\u201d",
  },
]

export function ScriptPanel({ businessName, phone, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const name = businessName || 'this business'

  const mainScript = [
    `Hi, is this ${name}?`,
    `My name is Jordan. I saw that ${name} recently received a Texas sales-tax permit and may be opening soon.`,
    `I help new businesses get their credit-card processing and payment equipment set up before opening.`,
    `Are you the person handling the payment system, or is there someone else I should speak with?`,
  ].join('\n\n')

  function copyScript() {
    navigator.clipboard.writeText(mainScript).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0 bg-white">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 text-base truncate">{name}</h2>
          {phone && (
            <p className="text-xs text-blue-600 mt-0.5">{fmtPhone(phone)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl"
            >
              <Phone size={15} /> Call Now
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-xl transition-colors"
            aria-label="Close script"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* Scrollable script body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Main opening script */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-blue-400 tracking-wider uppercase mb-3">
            OPENING SCRIPT
          </p>
          <p className="text-[16px] leading-8 text-gray-800 font-medium whitespace-pre-line">
            {mainScript}
          </p>
        </div>

        {/* Response cards */}
        {RESPONSES.map(({ label, text }) => (
          <div key={label} className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-2">
              {label}
            </p>
            <p className="text-[15px] leading-7 text-gray-700">{text}</p>
          </div>
        ))}
      </div>

      {/* Footer — Copy + Call */}
      <div className="shrink-0 px-4 pt-3 pb-4 border-t border-gray-100 bg-white">
        <div className="flex gap-3">
          <button
            onClick={copyScript}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors active:bg-gray-100"
          >
            {copied ? (
              <><Check size={15} className="text-green-500" /> Copied!</>
            ) : (
              <><Copy size={15} /> Copy Script</>
            )}
          </button>
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors active:bg-blue-800"
            >
              <Phone size={15} /> Call Now
            </a>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gray-100 text-gray-500 text-sm font-medium"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
