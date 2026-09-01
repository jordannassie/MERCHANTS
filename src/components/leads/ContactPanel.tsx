'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, Globe, MapPin, Copy, Check, ExternalLink,
  Search, User, Mail, AlertCircle, Loader2,
} from 'lucide-react'
import { fmtPhone, safeUrl } from '@/lib/utils'
import { EnrichmentBadge } from './EnrichmentBadge'
import type { Lead } from '@/lib/types'

interface Props {
  lead: Lead
}

interface ClaudeResult {
  proposed: {
    decision_maker_name?: string | null
    decision_maker_title?: string | null
    public_business_email?: string | null
    public_business_phone?: string | null
    website?: string | null
    facebook_url?: string | null
    instagram_url?: string | null
    linkedin_url?: string | null
    opening_status?: string | null
    opening_date?: string | null
    summary?: string | null
    match_confidence?: number | null
    sources?: Array<{ url: string; title: string }>
    warnings?: string[]
  }
  requiresReview: boolean
}

export function ContactPanel({ lead: initialLead }: Props) {
  const router = useRouter()
  const [lead, setLead] = useState(initialLead)
  const [copied, setCopied] = useState(false)
  const [claudeLoading, setClaudeLoading] = useState(false)
  const [claudeResult, setClaudeResult] = useState<ClaudeResult | null>(null)
  const [claudeError, setClaudeError] = useState<string | null>(null)
  const [savingClaude, setSavingClaude] = useState(false)

  function copyPhone() {
    if (!lead.primary_phone) return
    navigator.clipboard.writeText(lead.primary_phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function researchOwner() {
    setClaudeLoading(true)
    setClaudeResult(null)
    setClaudeError(null)
    try {
      const res = await fetch('/api/enrich/claude-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setClaudeError(data.error ?? 'Research failed')
      } else {
        setClaudeResult(data)
      }
    } catch (e) {
      setClaudeError(String(e))
    } finally {
      setClaudeLoading(false)
    }
  }

  async function saveClaudeField(field: string, value: unknown) {
    setSavingClaude(true)
    try {
      const updates: Record<string, unknown> = {}
      if (field === 'phone') {
        updates.primary_phone = value
      } else if (field === 'email') {
        updates.primary_email = value
      } else if (field === 'website') {
        updates.website = value
      } else if (field === 'owner') {
        const parts = (value as string).split('|')
        updates.owner_name = parts[0]
        if (parts[1]) updates.contact_title = parts[1]
      }

      const res = await fetch(`/api/leads/${lead.id}/crm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.lead) setLead((l) => ({ ...l, ...data.lead }))
        router.refresh()
      }
    } finally {
      setSavingClaude(false)
    }
  }

  const mapsUrl =
    lead.google_maps_url ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [lead.outlet_name ?? lead.display_name, lead.outlet_address, lead.outlet_city, 'TX'].filter(Boolean).join(' ')
    )}`

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 text-sm">Contact Information</h2>
        <EnrichmentBadge
          status={lead.enrichment_status}
          confidence={lead.contact_match_confidence}
        />
      </div>

      {/* ── Phone ── */}
      <div className="space-y-2">
        {lead.primary_phone ? (
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`tel:${lead.primary_phone}`}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
              aria-label={`Call ${fmtPhone(lead.primary_phone)}`}
            >
              <Phone size={15} />
              Call {fmtPhone(lead.primary_phone)}
            </a>
            <button
              onClick={copyPhone}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 px-2 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            {lead.contact_source === 'google_places' && (
              <span className="text-xs text-gray-400">via Google Places</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 flex items-center gap-1.5">
            <Phone size={13} /> No phone number found
          </p>
        )}

        {/* ── Website + Maps ── */}
        <div className="flex flex-wrap gap-3 text-sm">
          {lead.website ? (
            <a
              href={safeUrl(lead.website) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-blue-600 hover:underline"
            >
              <Globe size={13} />
              {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-gray-400 flex items-center gap-1.5 text-xs"><Globe size={13} />No website</span>
          )}

          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-blue-600 hover:underline text-xs"
          >
            <MapPin size={13} /> Google Maps <ExternalLink size={11} />
          </a>
        </div>

        {/* ── Email ── */}
        {lead.primary_email && (
          <a
            href={`mailto:${lead.primary_email}`}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            <Mail size={13} /> {lead.primary_email}
          </a>
        )}

        {/* ── Owner/Decision-maker ── */}
        {(lead.owner_name || lead.contact_title) && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <User size={13} className="text-gray-400" />
            <span>{lead.owner_name}</span>
            {lead.contact_title && (
              <span className="text-gray-400">· {lead.contact_title}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
        {/* Find Contact is in EnrichContactButton — reference it here inline */}
        <EnrichContactInline leadId={lead.id} hasGooglePlaceId={!!lead.google_place_id} enrichmentStatus={lead.enrichment_status} onRefresh={() => router.refresh()} />

        <button
          onClick={researchOwner}
          disabled={claudeLoading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
        >
          {claudeLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {claudeLoading ? 'Researching…' : 'Research Owner'}
        </button>
      </div>

      {/* ── Claude error ── */}
      {claudeError && (
        <div className="mt-3 flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {claudeError}
        </div>
      )}

      {/* ── Claude results ── */}
      {claudeResult && (
        <div className="mt-3 border border-purple-200 bg-purple-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-purple-900">Research Results</p>
            <span className={`text-xs font-bold ${(claudeResult.proposed.match_confidence ?? 0) >= 85 ? 'text-green-600' : 'text-amber-600'}`}>
              {claudeResult.proposed.match_confidence ?? 0}% confidence
            </span>
          </div>

          {claudeResult.proposed.summary && (
            <p className="text-xs text-purple-800 italic">{claudeResult.proposed.summary}</p>
          )}

          <div className="space-y-1.5">
            {claudeResult.proposed.decision_maker_name && (
              <ProposedRow
                label="Owner/DM"
                value={`${claudeResult.proposed.decision_maker_name}${claudeResult.proposed.decision_maker_title ? ` · ${claudeResult.proposed.decision_maker_title}` : ''}`}
                existing={lead.owner_name ?? null}
                onSave={() => saveClaudeField('owner', `${claudeResult.proposed.decision_maker_name}|${claudeResult.proposed.decision_maker_title ?? ''}`)}
                saving={savingClaude}
              />
            )}
            {claudeResult.proposed.public_business_phone && !lead.primary_phone && (
              <ProposedRow
                label="Phone"
                value={claudeResult.proposed.public_business_phone}
                existing={lead.primary_phone}
                onSave={() => saveClaudeField('phone', claudeResult!.proposed.public_business_phone)}
                saving={savingClaude}
              />
            )}
            {claudeResult.proposed.public_business_email && !lead.primary_email && (
              <ProposedRow
                label="Email"
                value={claudeResult.proposed.public_business_email}
                existing={lead.primary_email}
                onSave={() => saveClaudeField('email', claudeResult!.proposed.public_business_email)}
                saving={savingClaude}
              />
            )}
            {claudeResult.proposed.website && !lead.website && (
              <ProposedRow
                label="Website"
                value={claudeResult.proposed.website}
                existing={lead.website}
                onSave={() => saveClaudeField('website', claudeResult!.proposed.website)}
                saving={savingClaude}
              />
            )}
          </div>

          {claudeResult.proposed.warnings && claudeResult.proposed.warnings.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              {claudeResult.proposed.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
            </div>
          )}

          {claudeResult.proposed.sources && claudeResult.proposed.sources.length > 0 && (
            <div className="text-xs text-gray-500 space-y-0.5">
              <p className="font-medium">Sources:</p>
              {claudeResult.proposed.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:underline truncate">
                  {s.title || s.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProposedRow({
  label,
  value,
  existing,
  onSave,
  saving,
}: {
  label: string
  value: string
  existing: string | null | undefined
  onSave: () => void
  saving: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-xs bg-white rounded-lg border border-purple-100 px-3 py-2">
      <span className="text-gray-500 w-14 shrink-0">{label}</span>
      <span className="text-gray-900 flex-1 min-w-0 truncate">{value}</span>
      {!existing && (
        <button
          onClick={onSave}
          disabled={saving}
          className="shrink-0 text-xs px-2 py-0.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          Save
        </button>
      )}
    </div>
  )
}

// ── Inline Find Contact (within ContactPanel) ─────────────────────────────────
function EnrichContactInline({
  leadId,
  hasGooglePlaceId,
  onRefresh,
}: {
  leadId: string
  hasGooglePlaceId: boolean
  enrichmentStatus?: string | null
  onRefresh: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function find() {
    setLoading(true)
    setStatus(null)
    const res = await fetch('/api/enrich/find-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, forceRefresh: hasGooglePlaceId }),
    })
    const data = await res.json()
    setStatus(data.status)
    if (data.status === 'found') onRefresh()
    setLoading(false)
  }

  return (
    <button
      onClick={find}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
      {loading ? 'Searching…' : status === 'found' ? '✓ Found' : hasGooglePlaceId ? 'Re-search' : 'Find Contact'}
    </button>
  )
}
