'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone, Globe, MapPin, Copy, Check, ExternalLink,
  Search, User, Mail, AlertCircle, Loader2,
  Star, ShieldCheck, HelpCircle, RefreshCw, Building2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { fmtPhone, safeUrl } from '@/lib/utils'
import { formatPhone, telHref } from '@/lib/phone-normalize'
import { resolveNaics, NAICS_TIER_COLORS } from '@/lib/naics'
import { EnrichmentBadge } from './EnrichmentBadge'
import type { Lead, Contact, EntityRecord } from '@/lib/types'

// Metadata packed into contacts.notes for backward compat with no-migration schema
interface ContactNotes {
  linkedin_url?: string | null
  confidence?: number | null
  verification_status?: string | null
  research_summary?: string | null
  all_source_urls?: string[]
}

function parseNotes(notes: string | null | undefined): ContactNotes {
  if (!notes) return {}
  try { return JSON.parse(notes) } catch { return {} }
}

interface PlaceCache {
  source?: string
  google_place_id?: string
  confidence?: number
  displayName?: string
  formattedAddress?: string
  businessStatus?: string
  primaryType?: string
}

interface Props {
  lead: Lead
  contacts: Contact[]
  placeCache?: PlaceCache | null    // from enrichment_jobs.raw_response
  entityRecord?: EntityRecord | null
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfidencePill({ confidence }: { confidence: number }) {
  const color =
    confidence >= 85 ? 'bg-green-50 text-green-700 border-green-200' :
    confidence >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                       'bg-red-50 text-red-600 border-red-200'
  const icon = confidence >= 85 ? '✓' : confidence >= 70 ? '~' : '?'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${color}`}>
      {icon} {confidence}% match
    </span>
  )
}

export function ContactPanel({ lead: initialLead, contacts: initialContacts, placeCache, entityRecord: initialEntityRecord }: Props) {
  const router = useRouter()
  const [lead, setLead] = useState(initialLead)
  const [contacts] = useState(initialContacts)
  const [copiedPhone, setCopiedPhone] = useState(false)
  const [entityRecord, setEntityRecord] = useState(initialEntityRecord)
  const [entityLoading, setEntityLoading] = useState(false)
  const [entityError, setEntityError] = useState<string | null>(null)
  const [entityErrorCode, setEntityErrorCode] = useState<string | null>(null)
  const [entityWaitSeconds, setEntityWaitSeconds] = useState<number | null>(null)
  const [entityExpanded, setEntityExpanded] = useState(false)

  // Find Contact state
  const [findLoading, setFindLoading] = useState(false)
  const [findResult, setFindResult] = useState<{
    status: string
    confidence?: number
    place?: { displayName: string; formattedAddress: string; nationalPhoneNumber?: string | null; websiteUri?: string | null; googleMapsUri?: string | null; businessStatus?: string | null; confidence: number }
    candidates?: Array<{ id: string; displayName: string; formattedAddress: string; nationalPhoneNumber?: string | null; websiteUri?: string | null; googleMapsUri?: string | null; businessStatus?: string | null; confidence: number }>
    googleSearchUrl?: string
    error?: string
  } | null>(null)
  const [showReview, setShowReview] = useState(false)

  // Research Owner state
  const [ownerLoading, setOwnerLoading] = useState(false)
  const [ownerResult, setOwnerResult] = useState<{
    status: string
    proposed?: {
      person_name: string | null
      job_title: string | null
      business_email: string | null
      business_phone: string | null
      linkedin_url: string | null
      source_urls: string[]
      confidence: number
      research_summary: string
    }
    requiresReview?: boolean
    error?: string
  } | null>(null)

  // Saving reviewed owner
  const [savingOwner, setSavingOwner] = useState(false)

  // Full research (both steps)
  const [fullLoading, setFullLoading] = useState(false)

  // Primary enriched contact
  const enrichedContact = contacts.find(c => c.source_type === 'enriched' && c.is_primary) ?? contacts.find(c => c.source_type === 'enriched')
  const enrichedMeta = parseNotes(enrichedContact?.notes)

  // Google confidence — prefer leads column (if migration 006 applied), else enrichment_jobs cache
  const placeConfidence = (lead as Lead & { contact_match_confidence?: number | null }).contact_match_confidence
    ?? placeCache?.confidence

  const copyPhone = useCallback(() => {
    if (!lead.primary_phone) return
    navigator.clipboard.writeText(lead.primary_phone)
    setCopiedPhone(true)
    setTimeout(() => setCopiedPhone(false), 1500)
  }, [lead.primary_phone])

  const mapsUrl =
    lead.google_maps_url ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [lead.outlet_name ?? lead.display_name, lead.outlet_address, lead.outlet_city, 'TX']
        .filter(Boolean).join(' ')
    )}`

  // ── Find Contact ────────────────────────────────────────────────────────────
  async function findContact(force = false) {
    setFindLoading(true)
    setFindResult(null)
    setShowReview(false)
    try {
      const res = await fetch('/api/enrich/find-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, forceRefresh: force }),
      })
      const data = await res.json()
      setFindResult(data)
      if (data.status === 'review') setShowReview(true)
      if (data.status === 'found' && data.lead) {
        setLead(l => ({ ...l, ...data.lead }))
      }
    } catch (e) {
      setFindResult({ status: 'error', error: String(e) })
    } finally {
      setFindLoading(false)
    }
  }

  // ── Save reviewed Place candidate ────────────────────────────────────────────
  type CandidateItem = NonNullable<NonNullable<typeof findResult>['candidates']>[number]
  async function saveCandidate(c: CandidateItem) {
    if (!c) return
    const res = await fetch('/api/enrich/save-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: lead.id,
        placeId: c.id,
        phone: c.nationalPhoneNumber,
        website: c.websiteUri,
        googleMapsUri: c.googleMapsUri,
        businessStatus: c.businessStatus,
        confidence: c.confidence,
        displayName: c.displayName,
        formattedAddress: c.formattedAddress,
      }),
    })
    const data = await res.json()
    if (data.lead) setLead(l => ({ ...l, ...data.lead }))
    setShowReview(false)
    setFindResult(null)
    router.refresh()
  }

  // ── Research Owner ───────────────────────────────────────────────────────────
  async function researchOwner(force = false) {
    setOwnerLoading(true)
    setOwnerResult(null)
    try {
      const res = await fetch('/api/enrich/research-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, forceRefresh: force }),
      })
      const data = await res.json()
      setOwnerResult(data)
      if (data.status === 'found' && !data.requiresReview) router.refresh()
    } catch (e) {
      setOwnerResult({ status: 'error', error: String(e) })
    } finally {
      setOwnerLoading(false)
    }
  }

  // ── Save confirmed owner from review ─────────────────────────────────────────
  async function saveOwner(proposed: NonNullable<typeof ownerResult>['proposed']) {
    if (!proposed?.person_name) return
    setSavingOwner(true)
    try {
      await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          full_name: proposed.person_name,
          title: proposed.job_title,
          email: proposed.business_email,
          business_phone: proposed.business_phone ?? lead.primary_phone,
          source_url: proposed.source_urls[0],
          is_primary: true,
          source_type: 'enriched',
          contact_type: proposed.job_title?.toLowerCase().includes('owner') || proposed.job_title?.toLowerCase().includes('founder') ? 'owner' : 'manager',
          notes: JSON.stringify({
            linkedin_url: proposed.linkedin_url,
            confidence: proposed.confidence,
            verification_status: 'manually_confirmed',
            research_summary: proposed.research_summary,
            all_source_urls: proposed.source_urls,
          }),
        }),
      })
      setOwnerResult(null)
      router.refresh()
    } finally {
      setSavingOwner(false)
    }
  }

  // ── Entity / LLC research (CPA API) ──────────────────────────────────────────
  async function lookupEntity(force = false) {
    if (entityLoading) return  // prevent duplicate clicks
    setEntityLoading(true)
    setEntityError(null)
    setEntityErrorCode(null)
    setEntityWaitSeconds(null)
    try {
      const res = await fetch('/api/enrich/lookup-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, force }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEntityError(data.error ?? 'Entity lookup failed')
        setEntityErrorCode(data.errorCode ?? null)
        setEntityWaitSeconds(data.waitSeconds ?? null)
        setEntityExpanded(true)
      } else {
        setEntityRecord(data.entity ?? null)
        setEntityExpanded(true)
        router.refresh()
      }
    } catch (e) {
      setEntityError(String(e))
      setEntityExpanded(true)
    } finally {
      setEntityLoading(false)
    }
  }

  // ── Run Full Research ─────────────────────────────────────────────────────────
  async function runFullResearch() {
    setFullLoading(true)
    setFindResult(null)
    setOwnerResult(null)
    try {
      const res = await fetch('/api/enrich/run-full-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, skipIfEnriched: false }),
      })
      const data = await res.json()
      if (data.contact?.lead) setLead(l => ({ ...l, ...data.contact.lead }))
      if (data.contact) setFindResult(data.contact)
      if (data.owner) setOwnerResult(data.owner)
      router.refresh()
    } catch (e) {
      setFindResult({ status: 'error', error: String(e) })
    } finally {
      setFullLoading(false)
    }
  }

  const isEnriched = lead.enrichment_status === 'completed'

  // ── Resolved best callable phone (priority order) ──────────────────────────
  // 1. Texas permit phone  2. primary_phone (Google/manual)
  const permitPhone = (lead as Lead & { permit_phone?: string | null }).permit_phone
  const permitPhoneSource = (lead as Lead & { permit_phone_source?: string | null }).permit_phone_source
  const bestPhone = permitPhone ?? lead.primary_phone
  const bestPhoneLabel = permitPhone
    ? 'Texas permit phone'
    : lead.primary_phone
      ? (placeCache ? 'Google business phone' : 'Phone')
      : null

  // NAICS for display
  const naicsResolved = lead.naics_code ? resolveNaics(lead.naics_code) : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 mb-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900 text-sm">Contact Intelligence</h2>
        <div className="flex items-center gap-2">
          {naicsResolved && (
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${NAICS_TIER_COLORS[naicsResolved.tier]}`}>
              {naicsResolved.label}
            </span>
          )}
          <EnrichmentBadge status={lead.enrichment_status} confidence={placeConfidence} />
        </div>
      </div>

      {/* ── Best callable phone (contact priority) ── */}
      <div className="space-y-3">
        {bestPhone ? (
          <div className="space-y-1.5">
            {/* Priority label */}
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              {bestPhoneLabel}
              {permitPhoneSource === 'sift_weekly' && (
                <span className="ml-1.5 normal-case bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded text-[10px]">
                  Texas Comptroller record
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={telHref(bestPhone) ?? '#'}
                className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-base font-bold rounded-xl transition-colors shadow-sm"
              >
                <Phone size={16} />
                {formatPhone(bestPhone) ?? fmtPhone(bestPhone)}
              </a>
              <button
                onClick={copyPhone}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                {copiedPhone ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                {copiedPhone ? 'Copied' : 'Copy'}
              </button>
              {placeCache?.confidence != null && !isNaN(placeCache.confidence as number) && !permitPhone && (
                <ConfidencePill confidence={placeCache.confidence as number} />
              )}
              {placeConfidence != null && !placeCache?.confidence && !permitPhone && (
                <ConfidencePill confidence={placeConfidence} />
              )}
            </div>

            {/* Secondary phone if permit phone shown separately from Google phone */}
            {permitPhone && lead.primary_phone && lead.primary_phone !== permitPhone && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="text-gray-400">Also Google phone:</span>
                <a href={`tel:${lead.primary_phone}`} className="text-blue-600 hover:underline">
                  {formatPhone(lead.primary_phone) ?? fmtPhone(lead.primary_phone)}
                </a>
              </div>
            )}

            {/* Permit phone disclaimer */}
            {permitPhone && (
              <p className="text-[11px] text-gray-400 italic">
                Business phone from TX Comptroller permit record. Not the owner&apos;s direct personal number unless independently verified.
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
            <Phone size={14} />
            No phone number found yet
          </div>
        )}

        {/* ── Website + Maps ── */}
        <div className="flex flex-wrap gap-3">
          {lead.website ? (
            <a href={safeUrl(lead.website) ?? '#'} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium">
              <Globe size={14} />
              {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-sm text-gray-400 flex items-center gap-1.5"><Globe size={14} />No website yet</span>
          )}
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <MapPin size={14} /> Google Maps <ExternalLink size={11} />
          </a>
        </div>

        {/* ── Google Places source ── */}
        {placeCache && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
            {placeCache.displayName && (
              <p>
                <span className="text-gray-400 w-20 inline-block">Place:</span>
                {String(placeCache.displayName)}
              </p>
            )}
            {placeCache.formattedAddress && (
              <p>
                <span className="text-gray-400 w-20 inline-block">Address:</span>
                {String(placeCache.formattedAddress)}
              </p>
            )}
            {placeCache.businessStatus && (
              <p>
                <span className="text-gray-400 w-20 inline-block">Status:</span>
                <span className={placeCache.businessStatus === 'OPERATIONAL' ? 'text-green-600 font-medium' : 'text-amber-600'}>
                  {String(placeCache.businessStatus).replace('_', ' ')}
                </span>
              </p>
            )}
          </div>
        )}

        {/* ── Decision-maker (website research) ── */}
        {enrichedContact ? (
          <div className="border border-gray-100 rounded-xl p-3 space-y-1.5 bg-gray-50">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Decision-Maker (website research)</p>
            <div className="flex items-center gap-2 flex-wrap">
              <User size={13} className="text-gray-400 shrink-0" />
              <span className="text-sm font-semibold text-gray-900">{enrichedContact.full_name}</span>
              {enrichedContact.title && (
                <span className="text-xs text-gray-500">· {enrichedContact.title}</span>
              )}
              {enrichedMeta.verification_status === 'verified' && (
                <ShieldCheck size={13} className="text-green-500 ml-auto" />
              )}
            </div>
            {enrichedContact.email && (
              <a href={`mailto:${enrichedContact.email}`}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Mail size={12} /> {enrichedContact.email}
              </a>
            )}
            {enrichedContact.business_phone && enrichedContact.business_phone !== lead.primary_phone && (
              <a href={`tel:${enrichedContact.business_phone}`}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Phone size={12} /> {enrichedContact.business_phone}
              </a>
            )}
            {enrichedMeta.linkedin_url && (
              <a href={enrichedMeta.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                🔗 <ExternalLink size={12} /> LinkedIn <ExternalLink size={10} />
              </a>
            )}
            {enrichedMeta.confidence != null && (
              <div className="flex items-center gap-2 mt-1">
                <ConfidencePill confidence={enrichedMeta.confidence} />
                {enrichedMeta.verification_status && (
                  <span className="text-xs text-gray-400">{enrichedMeta.verification_status.replace('_', ' ')}</span>
                )}
              </div>
            )}
            {enrichedMeta.research_summary && (
              <p className="text-xs text-gray-500 italic mt-1">{enrichedMeta.research_summary}</p>
            )}
            {enrichedMeta.all_source_urls && enrichedMeta.all_source_urls.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {enrichedMeta.all_source_urls.slice(0, 3).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-gray-400 hover:text-blue-600 hover:underline truncate max-w-[180px]">
                    {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                ))}
              </div>
            )}
            <button onClick={() => researchOwner(true)} className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 mt-1">
              <RefreshCw size={10} /> Re-research
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
            <HelpCircle size={14} />
            Decision-maker not verified — click Find Decision-Maker or call and ask for the owner or manager.
          </div>
        )}
      </div>

      {/* ── LLC Record Research (CPA API, Phase 3) ── */}
      <EntityResearchSection
        lead={lead}
        entityRecord={entityRecord}
        loading={entityLoading}
        error={entityError}
        errorCode={entityErrorCode}
        waitSeconds={entityWaitSeconds}
        expanded={entityExpanded}
        onToggle={() => setEntityExpanded(e => !e)}
        onLookup={() => lookupEntity(false)}
        onRefresh={() => lookupEntity(true)}
      />

      {/* ── Action buttons ── */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => findContact(isEnriched)}
          disabled={findLoading || fullLoading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {findLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {isEnriched ? 'Re-search Business' : 'Find Business Contact'}
        </button>

        <button
          onClick={() => researchOwner(!!enrichedContact)}
          disabled={ownerLoading || fullLoading || !lead.website}
          title={!lead.website ? 'Find a website first' : undefined}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-50"
        >
          {ownerLoading ? <Loader2 size={12} className="animate-spin" /> : <User size={12} />}
          {enrichedContact ? 'Re-research DM' : 'Find Decision-Maker'}
        </button>

        <button
          onClick={runFullResearch}
          disabled={fullLoading || findLoading || ownerLoading}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
        >
          {fullLoading ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
          {fullLoading ? 'Researching…' : 'Run Full Research'}
        </button>
      </div>

      {/* ── Find Contact results ── */}
      {findResult && (
        <FindResultPanel
          result={findResult}
          showReview={showReview}
          onSave={saveCandidate}
          onDismiss={() => { setShowReview(false); setFindResult(null) }}
        />
      )}

      {/* ── Owner research results ── */}
      {ownerResult && (
        <OwnerResultPanel
          result={ownerResult}
          onSave={saveOwner}
          onDismiss={() => setOwnerResult(null)}
          saving={savingOwner}
        />
      )}
    </div>
  )
}

// ── Entity Research Section (Phase 3) ──────────────────────────────────────────

function EntityResearchSection({
  lead, entityRecord, loading, error, errorCode, waitSeconds, expanded, onToggle, onLookup, onRefresh,
}: {
  lead: Lead
  entityRecord: EntityRecord | null | undefined
  loading: boolean
  error: string | null
  errorCode: string | null
  waitSeconds: number | null
  expanded: boolean
  onToggle: () => void
  onLookup: () => void
  onRefresh: () => void
}) {
  const hasTaxpayer = !!lead.taxpayer_number

  const waitMin = waitSeconds ? Math.ceil(waitSeconds / 60) : null

  const entityErrorNode = !error ? null
    : errorCode === 'cpa_key_missing' ? (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
          <p className="font-semibold text-amber-800 flex items-center gap-1.5">
            <AlertCircle size={12} /> CPA API key not configured
          </p>
          <ol className="list-decimal list-inside text-amber-700 space-y-1 ml-0.5">
            <li>
              <a
                href="https://data-secure.comptroller.texas.gov/main/view"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline font-medium"
              >
                Get or manage your Texas CPA API key
                <ExternalLink size={10} className="shrink-0" />
              </a>
              {' '}— select <span className="font-medium">Tax Accounts (formerly FTAS)</span>
            </li>
            <li>Add <code className="bg-amber-100 px-1 rounded">CPA_API_KEY</code> to Netlify env vars (never <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_</code>)</li>
            <li>Redeploy the site</li>
          </ol>
        </div>
    ) : errorCode === 'migration_missing' ? (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
          <p className="font-semibold text-amber-800 flex items-center gap-1.5"><AlertCircle size={12} /> Migration 008 not applied</p>
          <p className="text-amber-700">Run <code className="bg-amber-100 px-1 rounded">supabase/migrations/008_permit_phone_and_entity.sql</code> in the <a href="https://supabase.com/dashboard/project/phhczohqidgrvcmszets/sql/new" target="_blank" rel="noopener noreferrer" className="underline">Supabase SQL Editor</a>.</p>
        </div>
    ) : errorCode === 'internal_rate_limit' ? (
        <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2 text-amber-700">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>{error}{waitMin ? ` — try again in ${waitMin} minute${waitMin === 1 ? '' : 's'}` : ''}</span>
        </div>
    ) : errorCode === 'entity_not_found' ? (
        <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-500 italic">
          Entity not found in Texas Comptroller records for taxpayer ID {lead.taxpayer_number}.
          The business may be registered under a different taxpayer ID or may not file franchise tax.
        </div>
    ) : (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
    )

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Building2 size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-700">LLC / Entity Record Research</span>
          {entityRecord?.primary_contact_name && (
            <span className="text-xs text-gray-500">· {entityRecord.primary_contact_name}</span>
          )}
          {entityRecord && !entityRecord.primary_contact_name && (
            <span className="text-xs text-gray-400 italic">· no officer found</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!entityRecord && hasTaxpayer && (
            <span className="text-[10px] text-blue-600 font-medium">Look up</span>
          )}
          {expanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-3 space-y-3 border-t border-gray-100">
          {entityErrorNode}

          {!entityRecord && !loading && !error && hasTaxpayer && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Look up entity data via the Texas Comptroller CPA API — officer names, SOS file number, registered agent.
                Requires <code className="bg-gray-100 px-1 rounded text-[11px]">CPA_API_KEY</code> in Netlify environment variables.
              </p>
              <button
                onClick={onLookup}
                disabled={loading}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Building2 size={12} />}
                {loading ? 'Looking up…' : 'Look Up Entity Record'}
              </button>
            </div>
          )}

          {!hasTaxpayer && (
            <p className="text-xs text-gray-400 italic">No taxpayer number — entity lookup not available for this lead.</p>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 size={12} className="animate-spin" /> Looking up entity record…
            </div>
          )}

          {entityRecord && (
            <div className="space-y-3">
              {/* Entity summary */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
                {entityRecord.legal_entity_name && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-28 shrink-0">Legal Name</span>
                    <span className="text-gray-900 font-medium">{entityRecord.legal_entity_name}</span>
                  </div>
                )}
                {entityRecord.dba_name && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-28 shrink-0">DBA</span>
                    <span className="text-gray-900">{entityRecord.dba_name}</span>
                  </div>
                )}
                {entityRecord.sos_file_number && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-28 shrink-0">TX SOS File #</span>
                    <span className="text-gray-900 font-mono">{entityRecord.sos_file_number}</span>
                  </div>
                )}
                {entityRecord.sos_registration_status && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-28 shrink-0">SOS Status</span>
                    <span className={entityRecord.sos_registration_status === 'Active' ? 'text-green-600 font-medium' : 'text-amber-600'}>
                      {entityRecord.sos_registration_status}
                    </span>
                  </div>
                )}
                {entityRecord.state_of_formation && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-28 shrink-0">Formed In</span>
                    <span className="text-gray-900">{entityRecord.state_of_formation}</span>
                  </div>
                )}
              </div>

              {/* Decision maker from official record */}
              {entityRecord.primary_contact_name ? (
                <div className="border border-blue-100 rounded-lg p-3 bg-blue-50 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-blue-500 font-semibold mb-1">
                    Possible Decision-Maker (Official Record)
                  </p>
                  <div className="flex items-center gap-2">
                    <User size={12} className="text-blue-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-900">{entityRecord.primary_contact_name}</span>
                  </div>
                  {entityRecord.primary_contact_title && (
                    <p className="text-xs text-gray-600 pl-4">
                      Official title: <span className="font-medium">{entityRecord.primary_contact_title}</span>
                    </p>
                  )}
                  {entityRecord.entity_confidence != null && (
                    <div className="pl-4">
                      <ConfidencePill confidence={entityRecord.entity_confidence} />
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 italic pl-4 mt-1">
                    {entityRecord.primary_contact_role === 'sole_proprietor'
                      ? 'Sole proprietor on TX Comptroller record.'
                      : entityRecord.primary_contact_role === 'officer'
                      ? 'Officer/director on TX Secretary of State record via CPA franchise-tax API.'
                      : 'Source: Texas Comptroller CPA API.'}
                    {' '}Never infer a direct personal phone from an entity record.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic bg-gray-50 rounded-lg px-3 py-2">
                  No named officer or decision-maker found in franchise-tax record for this taxpayer ID.
                  Call the business and ask for the owner or manager.
                </div>
              )}

              {/* Registered agent (shown but flagged if commercial) */}
              {entityRecord.registered_agent_name && (
                <div className="flex gap-2 text-xs">
                  <span className="text-gray-400 w-28 shrink-0">Reg. Agent</span>
                  <span className={entityRecord.registered_agent_is_commercial ? 'text-gray-400 line-through' : 'text-gray-700'}>
                    {entityRecord.registered_agent_name}
                  </span>
                  {entityRecord.registered_agent_is_commercial && (
                    <span className="text-[10px] text-gray-400 italic">commercial RA — not a sales contact</span>
                  )}
                </div>
              )}

              {/* Officers list */}
              {entityRecord.officers && entityRecord.officers.length > 0 && (
                <details className="group">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 list-none flex items-center gap-1">
                    <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
                    All officers/directors ({entityRecord.officers.length})
                  </summary>
                  <div className="mt-2 space-y-1 pl-4">
                    {entityRecord.officers.map((o, i) => (
                      <div key={i} className="text-xs text-gray-600 flex gap-2">
                        <span className="font-medium text-gray-900">{o.AGNT_NM}</span>
                        <span className="text-gray-400">{o.AGNT_TITL_TX}</span>
                        {o.AGNT_ACTV_YR && <span className="text-gray-400">({o.AGNT_ACTV_YR})</span>}
                        {o.SOURCE && <span className="text-[10px] text-gray-300">{o.SOURCE}</span>}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-3 pt-1 border-t border-gray-100 text-xs">
                <a
                  href="https://mycpa.cpa.state.tx.us/coa/cosSearch.do"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  TX SOS Search <ExternalLink size={10} />
                </a>
                {entityRecord.sos_file_number && (
                  <a
                    href={`https://direct.sos.state.tx.us/corp_inquiry/corp_inquiry-entity.asp?spage=docs&:Sfiling_number=${entityRecord.sos_file_number}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    SOSDirect Filing #{entityRecord.sos_file_number} <ExternalLink size={10} />
                  </a>
                )}
                <a
                  href={`https://mycpa.cpa.state.tx.us/coa/cosSearch.do`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  CPA Entity Search <ExternalLink size={10} />
                </a>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-[10px] text-gray-400">
                  Researched {entityRecord.researched_at ? new Date(entityRecord.researched_at).toLocaleDateString() : 'unknown'}
                  {' · '}Source: Texas Comptroller CPA API
                </span>
                <button
                  onClick={onRefresh}
                  disabled={loading}
                  className="text-[10px] text-gray-400 hover:text-blue-600 flex items-center gap-1"
                >
                  <RefreshCw size={9} /> Refresh
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-panels ──────────────────────────────────────────────────────────────

interface FindResult {
  status: string
  confidence?: number
  place?: { displayName: string; formattedAddress: string; nationalPhoneNumber?: string | null; websiteUri?: string | null; googleMapsUri?: string | null; businessStatus?: string | null; confidence: number }
  candidates?: Array<{ id: string; displayName: string; formattedAddress: string; nationalPhoneNumber?: string | null; websiteUri?: string | null; googleMapsUri?: string | null; businessStatus?: string | null; confidence: number }>
  googleSearchUrl?: string
  error?: string
}

function FindResultPanel({
  result, showReview, onSave, onDismiss,
}: {
  result: FindResult
  showReview: boolean
  onSave: (c: NonNullable<FindResult['candidates']>[number]) => void
  onDismiss: () => void
}) {
  if (result.status === 'found') {
    return (
      <div className="flex items-start gap-2 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">
        <Check size={12} className="mt-0.5 shrink-0" />
        <span>
          Contact saved! Confidence {result.confidence}%.
          {result.place?.formattedAddress && ` Address: ${result.place.formattedAddress}`}
        </span>
      </div>
    )
  }

  if (result.status === 'already_enriched') {
    return (
      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
        Already enriched. Click Re-search Business to refresh.
      </div>
    )
  }

  if (result.status === 'not_found') {
    return (
      <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-700 flex-wrap">
        <AlertCircle size={12} className="shrink-0" />
        No matching business found in Google Places.
        {result.googleSearchUrl && (
          <a href={result.googleSearchUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline ml-auto">
            Search Google <ExternalLink size={10} />
          </a>
        )}
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600">
        <AlertCircle size={12} className="mt-0.5 shrink-0" />
        {result.error}
      </div>
    )
  }

  if (result.status === 'review' && showReview && result.candidates?.length) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
          <AlertCircle size={14} /> Review matches — confidence below 85%
        </p>
        <p className="text-xs text-amber-700">
          Verify the address matches your lead before saving.
        </p>
        {result.candidates.map(c => (
          <div key={c.id} className="bg-white rounded-lg border border-amber-200 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{c.displayName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.formattedAddress}</p>
                {c.nationalPhoneNumber && <p className="text-xs text-blue-600 mt-0.5">{c.nationalPhoneNumber}</p>}
                {c.websiteUri && (
                  <p className="text-xs text-blue-600 mt-0.5 truncate max-w-xs">
                    {c.websiteUri.replace(/^https?:\/\//, '')}
                  </p>
                )}
              </div>
              <ConfidencePill confidence={c.confidence} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => onSave(c)}
                className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
              >
                Save this match
              </button>
              <a
                href={c.googleMapsUri ?? `https://maps.google.com/?q=${encodeURIComponent(c.formattedAddress)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
              >
                Verify on Maps <ExternalLink size={9} />
              </a>
            </div>
          </div>
        ))}
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
      </div>
    )
  }

  return null
}

interface OwnerResult {
  status: string
  proposed?: {
    person_name: string | null
    job_title: string | null
    business_email: string | null
    business_phone: string | null
    linkedin_url: string | null
    source_urls: string[]
    confidence: number
    research_summary: string
  }
  requiresReview?: boolean
  error?: string
}

function OwnerResultPanel({
  result, onSave, onDismiss, saving,
}: {
  result: OwnerResult
  onSave: (p: NonNullable<OwnerResult['proposed']>) => void
  onDismiss: () => void
  saving: boolean
}) {
  if (result.status === 'no_website') {
    return (
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
        <AlertCircle size={12} className="shrink-0 mt-0.5" />
        No website found. Run Find Business Contact first.
      </div>
    )
  }

  if (result.status === 'already_researched') {
    return (
      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
        Decision-maker already researched. Click Re-research DM to refresh.
      </div>
    )
  }

  if (result.status === 'not_found' || (result.status === 'found' && !result.proposed?.person_name)) {
    return (
      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 italic">
        {result.proposed?.research_summary ?? 'Decision-maker not verified — call the business and ask for the owner or manager.'}
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
        <AlertCircle size={12} className="shrink-0 mt-0.5" />
        {result.error}
      </div>
    )
  }

  const p = result.proposed
  if (!p) return null

  const autoSaved = result.status === 'found' && !result.requiresReview
  const needsReview = result.status === 'review' || result.requiresReview

  return (
    <div className={`rounded-xl p-4 space-y-3 border ${autoSaved ? 'bg-green-50 border-green-200' : 'bg-purple-50 border-purple-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-semibold ${autoSaved ? 'text-green-800' : 'text-purple-800'}`}>
          {autoSaved ? '✓ Decision-maker found and saved' : 'Review decision-maker — confidence below 70%'}
        </p>
        <ConfidencePill confidence={p.confidence} />
      </div>

      {p.research_summary && (
        <p className="text-xs text-gray-600 italic">{p.research_summary}</p>
      )}

      <div className="bg-white rounded-lg border border-gray-100 p-3 space-y-1.5">
        {p.person_name && (
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <User size={13} className="text-gray-400" /> {p.person_name}
            {p.job_title && <span className="text-xs text-gray-500 font-normal">· {p.job_title}</span>}
          </p>
        )}
        {p.business_email && <p className="text-xs text-gray-700"><Mail size={11} className="inline mr-1" />{p.business_email}</p>}
        {p.business_phone && <p className="text-xs text-gray-700"><Phone size={11} className="inline mr-1" />{p.business_phone}</p>}
        {p.linkedin_url && (
          <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            🔗 <ExternalLink size={11} /> LinkedIn <ExternalLink size={9} />
          </a>
        )}
        {p.source_urls?.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Sources</p>
            {p.source_urls.slice(0, 3).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="block text-[11px] text-gray-400 hover:text-blue-600 hover:underline truncate max-w-xs">
                {url.replace(/^https?:\/\//, '')}
              </a>
            ))}
          </div>
        )}
      </div>

      {needsReview && p.person_name && (
        <div className="flex gap-2">
          <button
            onClick={() => onSave(p)}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm & Save'}
          </button>
          <button onClick={onDismiss} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
