'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Lead, Contact, Activity } from '@/lib/types'
import { fmtDate, fmtDateTime, fmtRelative, fmtPhone, STATUS_COLORS, PRIORITY_COLORS, safeUrl, buildMapsUrl } from '@/lib/utils'
import { DFW_COUNTIES } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { LogCallDialog } from './LogCallDialog'
import { ContactsSection } from './ContactsSection'
import {
  Phone, Globe, MapPin, Star, ChevronLeft, Copy, ExternalLink,
  MessageSquare, Clock, Edit2, Check, Info, Briefcase,
} from 'lucide-react'
import { updateLeadCRM, starLead, updateLeadStatus } from '@/lib/actions/leads'
import { ContactPanel } from './ContactPanel'

interface Props {
  lead: Lead
  contacts: Contact[]
  activities: (Activity & { contact?: { full_name: string } | null })[]
}

export function LeadDetailClient({ lead: initialLead, contacts: initialContacts, activities: initialActivities }: Props) {
  const router = useRouter()
  const [isPending] = useTransition()
  const [lead, setLead] = useState(initialLead)
  const [contacts, setContacts] = useState(initialContacts)
  const [activities, setActivities] = useState(initialActivities)
  const [logCallOpen, setLogCallOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editForm, setEditForm] = useState({
    primary_phone: lead.primary_phone ?? '',
    primary_email: lead.primary_email ?? '',
    website: lead.website ?? '',
    owner_name: lead.owner_name ?? '',
    contact_title: lead.contact_title ?? '',
    display_name: lead.display_name ?? '',
    category: lead.category ?? '',
  })

  const displayName = lead.display_name || lead.outlet_name || lead.taxpayer_name || '(Unnamed)'
  const mapsUrl = lead.google_maps_url || buildMapsUrl(
    displayName,
    lead.outlet_address ?? '',
    lead.outlet_city ?? '',
    lead.outlet_state ?? 'TX'
  )

  function copyPhone() {
    if (!lead.primary_phone) return
    navigator.clipboard.writeText(lead.primary_phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function toggleStar() {
    const next = !lead.starred
    setLead(l => ({ ...l, starred: next }))
    await starLead(lead.id, next)
  }

  async function handleStatusChange(status: Lead['status']) {
    setLead(l => ({ ...l, status }))
    await updateLeadStatus(lead.id, status)
    router.refresh()
  }

  async function saveEdit() {
    const updated = await updateLeadCRM(lead.id, editForm)
    if (updated) setLead(l => ({ ...l, ...updated }))
    setEditOpen(false)
    router.refresh()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 pb-24 md:pb-6">
      {/* Back */}
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4">
        <ChevronLeft size={14} /> All Leads
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button onClick={toggleStar} aria-label="Toggle star" className="text-gray-300 hover:text-yellow-400 transition-colors">
                <Star size={16} className={lead.starred ? 'text-yellow-400 fill-yellow-400' : ''} />
              </button>
              <h1 className="text-xl font-semibold text-gray-900 truncate">{displayName}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[lead.priority]}`}>{lead.priority}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[lead.status]}`}>{lead.status.replace('_', ' ')}</span>
              <span className="text-xs text-gray-500">Score: <strong>{lead.score}</strong></span>
            </div>
          </div>

          {/* CTA buttons — sticky on mobile */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {lead.primary_phone && (
              <a href={`tel:${lead.primary_phone}`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                <Phone size={14} /> Call {fmtPhone(lead.primary_phone)}
              </a>
            )}
            <Button variant="secondary" size="sm" onClick={() => setLogCallOpen(true)}>Log Call</Button>
            <Button variant="secondary" size="sm" onClick={() => setNoteOpen(true)}>Add Note</Button>
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gray-100">
          {lead.primary_phone && (
            <button onClick={copyPhone} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900">
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy phone'}
            </button>
          )}
          {lead.website && (
            <a href={safeUrl(lead.website) ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
              <Globe size={12} /> Website <ExternalLink size={10} />
            </a>
          )}
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <MapPin size={12} /> Maps <ExternalLink size={10} />
          </a>
          <button onClick={() => setEditOpen(true)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 ml-auto">
            <Edit2 size={12} /> Edit info
          </button>
        </div>

        {/* Status change */}
        <div className="mt-3">
          <label className="text-xs text-gray-500 block mb-1">Change status</label>
          <select
            value={lead.status}
            onChange={e => handleStatusChange(e.target.value as Lead['status'])}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            aria-label="Lead status"
          >
            {(['new','attempted','connected','follow_up','appointment','won','lost','do_not_contact'] as const).map(s => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {/* Score reasons */}
        {lead.score_reasons && lead.score_reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lead.score_reasons.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                <Info size={10} /> {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Contact Panel — shown prominently before permit data */}
      <ContactPanel lead={lead} />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Texas Permit Data */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Briefcase size={14} className="text-gray-400" /> Texas Permit Data
            <span className="text-xs text-gray-400 font-normal">(source record)</span>
          </h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Taxpayer', lead.taxpayer_name],
              ['Taxpayer Address', [lead.taxpayer_address, lead.taxpayer_city, lead.taxpayer_state, lead.taxpayer_zip].filter(Boolean).join(', ')],
              ['Outlet Name', lead.outlet_name],
              ['Outlet Address', [lead.outlet_address, lead.outlet_city, lead.outlet_state, lead.outlet_zip].filter(Boolean).join(', ')],
              ['County', lead.outlet_county_code ? (DFW_COUNTIES[lead.outlet_county_code] ?? lead.outlet_county_code) : null],
              ['NAICS', lead.naics_code],
              ['Org Type', lead.taxpayer_organization_type],
              ['Permit Issued', fmtDate(lead.permit_issue_date)],
              ['First Sales', fmtDate(lead.first_sales_date)],
              ['Taxpayer #', lead.taxpayer_number],
              ['Outlet #', lead.outlet_number],
            ].map(([label, value]) => value ? (
              <div key={label as string} className="flex gap-2">
                <dt className="text-gray-500 w-32 shrink-0">{label}</dt>
                <dd className="text-gray-900 break-words">{value as string}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {/* CRM Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-medium text-gray-900 mb-3">CRM Information</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Display Name', lead.display_name],
              ['Category', lead.category],
              ['Phone', lead.primary_phone ? fmtPhone(lead.primary_phone) : null],
              ['Email', lead.primary_email],
              ['Website', lead.website],
              ['Owner/DM', lead.owner_name],
              ['Title', lead.contact_title],
              ['Est. Processing', lead.est_monthly_processing ? `${lead.est_monthly_processing} (estimate only)` : null],
              ['Follow-up', lead.next_follow_up_at ? fmtDateTime(lead.next_follow_up_at) : null],
              ['Last Contacted', lead.last_contacted_at ? fmtRelative(lead.last_contacted_at) : null],
              ['Imported', fmtDate(lead.first_imported_at)],
            ].map(([label, value]) => value ? (
              <div key={label as string} className="flex gap-2">
                <dt className="text-gray-500 w-32 shrink-0">{label}</dt>
                <dd className="text-gray-900 break-words">
                  {label === 'Phone' ? (
                    <a href={`tel:${lead.primary_phone}`} className="text-blue-600 hover:underline">{value as string}</a>
                  ) : label === 'Email' ? (
                    <a href={`mailto:${value}`} className="text-blue-600 hover:underline">{value as string}</a>
                  ) : label === 'Website' ? (
                    <a href={safeUrl(value as string) ?? '#'} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                      {value as string} <ExternalLink size={10} />
                    </a>
                  ) : value as string}
                </dd>
              </div>
            ) : null)}
          </dl>
          <button onClick={() => setEditOpen(true)} className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1">
            <Edit2 size={11} /> Edit CRM fields
          </button>
        </div>
      </div>

      {/* Contacts */}
      <div className="mt-4">
        <ContactsSection
          leadId={lead.id}
          contacts={contacts}
          onContactsChange={setContacts}
        />
      </div>

      {/* Activity timeline */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200">
        <h2 className="font-medium text-gray-900 px-4 py-3 border-b border-gray-100">Activity Timeline</h2>
        {activities.length > 0 ? (
          <ul className="divide-y divide-gray-50">
            {activities.map(activity => (
              <li key={activity.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {activity.activity_type === 'call' ? <Phone size={13} className="text-blue-500" />
                      : activity.activity_type === 'note' ? <MessageSquare size={13} className="text-gray-400" />
                      : <Clock size={13} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-gray-700 capitalize">
                        {activity.activity_type}
                        {activity.call_outcome && ` — ${activity.call_outcome.replace('_', ' ')}`}
                      </span>
                      {activity.contact?.full_name && (
                        <span className="text-xs text-gray-400">with {activity.contact.full_name}</span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">{fmtRelative(activity.occurred_at)}</span>
                    </div>
                    {activity.notes && <p className="text-sm text-gray-700 mt-1">{activity.notes}</p>}
                    {activity.next_follow_up_at && (
                      <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                        <Clock size={10} /> Follow-up: {fmtDateTime(activity.next_follow_up_at)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">No activity yet.</p>
        )}
      </div>

      {/* Mobile sticky actions */}
      <div className="md:hidden fixed bottom-20 inset-x-4 z-30">
        <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-3 flex gap-2">
          {lead.primary_phone ? (
            <a href={`tel:${lead.primary_phone}`}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg">
              <Phone size={16} /> Call
            </a>
          ) : null}
          <button onClick={() => setLogCallOpen(true)}
            className="flex-1 py-3 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Log Call
          </button>
          <button onClick={() => setNoteOpen(true)}
            className="flex-1 py-3 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Add Note
          </button>
        </div>
      </div>

      {/* Log Call Dialog */}
      <LogCallDialog
        open={logCallOpen}
        onClose={() => setLogCallOpen(false)}
        leadId={lead.id}
        contacts={contacts}
        onSaved={(newActivity, updatedLead) => {
          setActivities(a => [newActivity, ...a])
          if (updatedLead) setLead(l => ({ ...l, ...updatedLead }))
          setLogCallOpen(false)
          router.refresh()
        }}
      />

      {/* Quick Note Dialog */}
      <QuickNoteDialog
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        leadId={lead.id}
        onSaved={(newActivity) => {
          setActivities(a => [newActivity, ...a])
          setNoteOpen(false)
          router.refresh()
        }}
      />

      {/* Edit CRM Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Edit CRM Information">
        <div className="space-y-3">
          {[
            { key: 'display_name', label: 'Display Name', type: 'text' },
            { key: 'primary_phone', label: 'Phone', type: 'tel' },
            { key: 'primary_email', label: 'Email', type: 'email' },
            { key: 'website', label: 'Website', type: 'url' },
            { key: 'owner_name', label: 'Owner / Decision Maker', type: 'text' },
            { key: 'contact_title', label: 'Title', type: 'text' },
            { key: 'category', label: 'Category', type: 'text' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={type}
                value={editForm[key as keyof typeof editForm]}
                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <p className="text-xs text-gray-400">These fields are never overwritten during Texas permit reimports.</p>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={saveEdit} loading={isPending}>Save</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

// ── Quick Note ────────────────────────────────────────────────────────────────

function QuickNoteDialog({ open, onClose, leadId, onSaved }: {
  open: boolean; onClose: () => void; leadId: string
  onSaved: (a: Activity) => void
}) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function save() {
    if (!note.trim()) return
    setLoading(true)
    const res = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, activityType: 'note', notes: note }),
    })
    const json = await res.json()
    setLoading(false)
    if (res.ok) { setNote(''); onSaved(json.activity) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add Note" size="sm">
      <div className="space-y-3">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={4}
          placeholder="Note…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          aria-label="Note text"
        />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={save} loading={loading} disabled={!note.trim()}>Save Note</Button>
        </div>
      </div>
    </Dialog>
  )
}
