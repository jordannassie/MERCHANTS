'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Save, FileText, ChevronDown, ChevronUp } from 'lucide-react'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

interface PrevNote {
  id: string
  notes: string | null
  occurred_at: string
}

interface Props {
  leadId: string
  leadName: string
  initialNote: string | null
  initialUpdatedAt?: string | null
  /** Activity-log notes to show in the collapsed Previous Notes section. */
  existingActivities?: PrevNote[]
}

export function MainNoteSection({
  leadId,
  leadName,
  initialNote,
  initialUpdatedAt,
  existingActivities = [],
}: Props) {
  const [text, setText] = useState(initialNote ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initialUpdatedAt ? new Date(initialUpdatedAt) : null,
  )
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [prevOpen, setPrevOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // On pages linked with /leads/[id]#main-note, scroll and focus
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#main-note') {
      const t = setTimeout(() => {
        document.getElementById('main-note')?.scrollIntoView({ behavior: 'smooth' })
        textareaRef.current?.focus()
      }, 120)
      return () => clearTimeout(t)
    }
  }, [])

  const doSave = useCallback(
    async (value: string) => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setSaveStatus('saving')
      try {
        const res = await fetch(`/api/leads/${leadId}/note`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ main_note: value }),
          signal: ac.signal,
        })
        if (ac.signal.aborted) return

        let json: Record<string, unknown> = {}
        try {
          json = (await res.json()) as Record<string, unknown>
        } catch {
          /* non-JSON response */
        }

        if (!res.ok) {
          if (json.error === 'migration_missing') setMigrationMissing(true)
          setSaveStatus('failed')
          return
        }

        const lead = json.lead as { main_note: string | null; main_note_updated_at: string }
        setSaveStatus('saved')
        setLastSavedAt(new Date(lead.main_note_updated_at))
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setSaveStatus('failed')
      }
    },
    [leadId],
  )

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setText(value)
    setSaveStatus('idle')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSave(value), 800)
  }

  function handleManualSave() {
    clearTimeout(debounceRef.current)
    doSave(text)
  }

  useEffect(
    () => () => {
      clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    },
    [],
  )

  function fmtTime(d: Date) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  function fmtDatetime(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const saveLabel =
    saveStatus === 'saved'
      ? `Saved ${lastSavedAt ? fmtTime(lastSavedAt) : ''}`
      : saveStatus === 'saving'
        ? 'Saving…'
        : saveStatus === 'failed'
          ? 'Save failed — click Save to retry'
          : lastSavedAt
            ? `Last saved ${fmtTime(lastSavedAt)}`
            : 'Not yet saved'

  const saveLabelColor =
    saveStatus === 'saved'
      ? 'text-green-700'
      : saveStatus === 'saving'
        ? 'text-yellow-700'
        : saveStatus === 'failed'
          ? 'text-red-600 font-semibold'
          : 'text-yellow-600'

  const prevNotes = existingActivities.filter(n => n.notes)

  return (
    <section id="main-note" className="bg-white rounded-xl border border-gray-200 overflow-hidden scroll-mt-6">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#fef9c3] border-b border-yellow-200">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={15} className="text-yellow-600 shrink-0" />
          <h2 className="text-sm font-semibold text-gray-900 truncate">Main Note</h2>
          <span className="text-xs text-gray-400 hidden sm:inline truncate">— {leadName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-xs ${saveLabelColor}`}>{saveLabel}</span>
          <button
            onClick={handleManualSave}
            disabled={saveStatus === 'saving'}
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-yellow-900 transition-colors disabled:opacity-60"
          >
            <Save size={11} /> Save Note
          </button>
        </div>
      </div>

      {/* Migration-missing warning */}
      {migrationMissing && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
          <strong>Migration 011 not applied.</strong> Run{' '}
          <code className="font-mono bg-red-100 px-1 rounded">
            supabase/migrations/011_main_note.sql
          </code>{' '}
          in the Supabase SQL editor to enable note saving.
        </div>
      )}

      {/* Legal-pad textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        placeholder={`Add notes for ${leadName}…\n\nRecord objections, talking points, follow-up items — anything you want to remember.`}
        className="w-full bg-[#fefce8] px-5 py-4 text-sm text-gray-800 leading-7 focus:outline-none resize-y min-h-[300px]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(transparent, transparent 27px, #fde68a 27px, #fde68a 28px)',
          backgroundSize: '100% 28px',
          backgroundPositionY: '4px',
        }}
        aria-label={`Main note for ${leadName}`}
      />

      {/* Previous quick-note activity log entries */}
      {prevNotes.length > 0 && (
        <div className="border-t border-yellow-200">
          <button
            onClick={() => setPrevOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-yellow-700 hover:bg-yellow-50 transition-colors"
          >
            <span>Previous Notes ({prevNotes.length})</span>
            {prevOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {prevOpen && (
            <div className="divide-y divide-yellow-100 bg-yellow-50">
              {prevNotes.map(n => (
                <div key={n.id} className="px-4 py-3">
                  <p className="text-[11px] text-yellow-600 mb-1">{fmtDatetime(n.occurred_at)}</p>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{n.notes}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
