'use client'

import { useState } from 'react'
import type { Contact } from '@/lib/types'
import { fmtPhone } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Plus, Phone, Mail, Trash2, Edit2, Star } from 'lucide-react'

interface Props {
  leadId: string
  contacts: Contact[]
  onContactsChange: (contacts: Contact[]) => void
}

const BLANK = { full_name: '', title: '', business_phone: '', mobile_phone: '', email: '', contact_type: 'other' as const, source_url: '', notes: '', is_primary: false }

export function ContactsSection({ leadId, contacts, onContactsChange }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startAdd() { setForm(BLANK); setError(null); setAddOpen(true) }
  function startEdit(c: Contact) {
    setForm({ full_name: c.full_name, title: c.title ?? '', business_phone: c.business_phone ?? '', mobile_phone: c.mobile_phone ?? '', email: c.email ?? '', contact_type: (c.contact_type ?? 'other') as typeof BLANK['contact_type'], source_url: c.source_url ?? '', notes: c.notes ?? '', is_primary: c.is_primary })
    setEditContact(c); setError(null)
  }

  async function saveContact() {
    if (!form.full_name.trim()) { setError('Name is required'); return }
    setLoading(true); setError(null)
    const url = editContact ? `/api/contacts/${editContact.id}` : '/api/contacts'
    const method = editContact ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, leadId }) })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    if (editContact) {
      onContactsChange(contacts.map(c => c.id === editContact.id ? json.contact : c))
      setEditContact(null)
    } else {
      onContactsChange([...contacts, json.contact])
      setAddOpen(false)
    }
  }

  async function deleteContact() {
    if (!deleteId) return
    setLoading(true)
    await fetch(`/api/contacts/${deleteId}`, { method: 'DELETE' })
    onContactsChange(contacts.filter(c => c.id !== deleteId))
    setDeleteId(null); setLoading(false)
  }

  const isOpen = addOpen || Boolean(editContact)
  const title = editContact ? 'Edit Contact' : 'Add Contact'

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="font-medium text-gray-900">Contacts ({contacts.length})</h2>
        <Button variant="ghost" size="sm" onClick={startAdd}>
          <Plus size={14} /> Add
        </Button>
      </div>

      {contacts.length > 0 ? (
        <ul className="divide-y divide-gray-50">
          {contacts.map(c => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {c.is_primary && <Star size={11} className="text-yellow-400 fill-yellow-400" />}
                    <p className="font-medium text-sm text-gray-900">{c.full_name}</p>
                    {c.title && <span className="text-xs text-gray-400">· {c.title}</span>}
                    <span className="text-xs text-gray-300">({c.source_type})</span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {c.business_phone && (
                      <a href={`tel:${c.business_phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <Phone size={10} /> {fmtPhone(c.business_phone)}
                      </a>
                    )}
                    {c.mobile_phone && (
                      <a href={`tel:${c.mobile_phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <Phone size={10} /> {fmtPhone(c.mobile_phone)} (mobile)
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <Mail size={10} /> {c.email}
                      </a>
                    )}
                  </div>
                  {c.notes && <p className="text-xs text-gray-500 mt-1">{c.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(c)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded" aria-label="Edit contact">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded" aria-label="Delete contact">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">No contacts added.</p>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={isOpen} onClose={() => { setAddOpen(false); setEditContact(null) }} title={title} size="md">
        <div className="space-y-3">
          {[
            { key: 'full_name', label: 'Full Name *', type: 'text', required: true },
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'business_phone', label: 'Business Phone', type: 'tel' },
            { key: 'mobile_phone', label: 'Mobile Phone', type: 'tel' },
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'source_url', label: 'Source URL (public listing)', type: 'url' },
            { key: 'notes', label: 'Notes', type: 'text' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type={type} value={form[key as keyof typeof form] as string}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={form.contact_type} onChange={e => setForm(f => ({ ...f, contact_type: e.target.value as typeof BLANK['contact_type'] }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              aria-label="Contact type">
              {['owner','manager','decision_maker','other'].map(v => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} className="rounded" />
            Mark as primary contact
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-xs text-gray-400">Only enter publicly available business contact information. Verify before use.</p>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => { setAddOpen(false); setEditContact(null) }}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={saveContact} loading={loading}>Save</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} title="Delete Contact" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">Remove this contact? This cannot be undone.</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={deleteContact} loading={loading}>Delete</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
