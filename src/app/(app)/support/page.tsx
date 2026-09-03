'use client'

import { useEffect, useState, useCallback } from 'react'
import { LifeBuoy, Mail, Phone, Clock, Trash2 } from 'lucide-react'

type SupportRequest = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string
  comments: string
  inquiry_type?: string | null
  industry?: string | null
  status: string
  created_at: string
}

function statusBadge(status: string) {
  const cfg: Record<string, string> = {
    new:         'bg-blue-50 text-blue-700',
    in_progress: 'bg-amber-50 text-amber-700',
    resolved:    'bg-green-50 text-green-700',
  }
  const label: Record<string, string> = {
    new: 'New', in_progress: 'In Progress', resolved: 'Resolved',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {label[status] ?? status}
    </span>
  )
}

export default function SupportPage() {
  const [requests, setRequests] = useState<SupportRequest[]>([])
  const [filter, setFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/support')
      if (res.ok) {
        const data = await res.json()
        // API returns array of support_requests
        setRequests(data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('Delete this support request?')) return
    setDeleting(id)
    try {
      await fetch(`/api/support/${id}`, { method: 'DELETE' })
      setRequests(r => r.filter(x => x.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  const newCount = requests.filter(r => r.status === 'new').length
  const filtered = filter ? requests.filter(r => (r.inquiry_type ?? 'Not specified') === filter) : requests
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <LifeBuoy size={20} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Requests</h1>
          <p className="text-sm text-gray-500">Inquiries submitted via the website contact form.</p>
        </div>
        <div className="ml-auto">
          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {newCount} new
          </span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-16 text-center">
          <LifeBuoy size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No support requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Filter control */ }
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-slate-500">Filter by need:</label>
            <select value={filter} onChange={e => setFilter(e.target.value)} className="text-sm border rounded px-3 py-1 text-slate-700">
              <option value=''>All</option>
              <option>I'm opening a new business</option>
              <option>I need a POS system or payment terminal</option>
              <option>I already accept cards — review my rates</option>
              <option>I want to switch payment providers</option>
              <option>I need help with online payments</option>
              <option>Something else</option>
            </select>
            <button onClick={() => setFilter('')} className="text-sm text-slate-500 ml-2">Clear</button>
          </div>

          {filtered.map(r => (
            <div key={r.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900 text-base">
                      {r.first_name} {r.last_name}
                    </span>
                    {statusBadge(r.status)}
                    <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {r.inquiry_type && r.inquiry_type.length > 0 ? r.inquiry_type : 'Not specified'}
                    </span>
                    <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {r.industry && r.industry.length > 0 ? r.industry : 'Not specified'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    {r.email && (
                      <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                        <Mail size={12} /> {r.email}
                      </a>
                    )}
                    {r.phone && (
                      <a href={`tel:${r.phone.replace(/\D/g, '')}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                        <Phone size={12} /> {r.phone}
                      </a>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(r.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deleting === r.id}
                  className="shrink-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  <Trash2 size={13} />
                  {deleting === r.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>

              {r.comments && (
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{r.comments}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
