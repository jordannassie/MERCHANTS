'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Save, FileText, ChevronDown, ChevronUp } from 'lucide-react'

interface PrevNote {
  id: string
  notes: string | null
  activity_type?: string
  occurred_at: string
}

interface Props {
  leadId: string
  leadName: string
  initialNote: string | null
  initialUpdatedAt?: string | null
  /** Pre-fetched activity notes — when provided, skips the fetch. */
  existingActivities?: PrevNote[]
  onClose: () => void
  /** Called after each successful save with the new note text and updated_at ISO string. */
  onSaved?: (note: string, updatedAt: string) => void
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export function NotepadPanel({
  leadId,
  leadName,
  initialNote,
  initialUpdatedAt,
  existingActivities,
  onClose,
  onSaved,
}: Props) {
  const [text, setText] = useState(initialNote ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initialUpdatedAt ? new Date(initialUpdatedAt) : null,
  )
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [prevNotes, setPrevNotes] = useState<PrevNote[]>(existingActivities ?? [])
  const [prevOpen, setPrevOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Fetch previous activity notes if not supplied by parent
  useEffect(() => {
    if (existingActivities !== undefined) return
    fetch(`/api/activities?leadId=${leadId}&type=note`)
      .then(r => r.json())
      .then((d: { activities?: PrevNote[] }) => setPrevNotes(d.activities ?? []))
      .catch(() => {})
  }, [leadId, existingActivities])

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
          json = await res.json()
        } catch {
          // non-JSON response
        }

        if (!res.ok) {
          if (json.error === 'migration_missing') setMigrationMissing(true)
          setSaveStatus('failed')
          return
        }

        const lead = json.lead as { main_note: string | null; main_note_updated_at: string }
        const savedAt = new Date(lead.main_note_updated_at)
        setSaveStatus('saved')
        setLastSavedAt(savedAt)
        onSaved?.(lead.main_note ?? '', lead.main_note_updated_at)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setSaveStatus('failed')
      }
    },
    [leadId, onSaved],
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

  function handleClose() {
    clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    onClose()
  }

  // Cleanup on unmount
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
          ? 'Save failed — tap Save to retry'
          : lastSavedAt
            ? `Last saved ${fmtTime(lastSavedAt)}`
            : 'Not yet saved'

  const saveLabelColor =
    saveStatus === 'saved'
      ? 'text-green-700'
      : saveStatus === 'saving'
        ? 'text-yellow-700'
        : saveStatus === 'failed'
          ? 'text-red-600 font-medium'
          : 'text-yellow-600'

  return (
    /* Fixed overlay — backdrop + panel */
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/20 cursor-default"
        onClick={handleClose}
        aria-label="Close notepad"
        tabIndex={-1}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl h-screen bg-[#fefce8] flex flex-col shadow-2xl border-l border-yellow-200">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-yellow-200 bg-[#fef9c3]">
          <FileText size={15} className="text-yellow-600 shrink-0" />
          <h2 className="font-semibold text-gray-900 text-sm truncate flex-1">{leadName}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs ${saveLabelColor}`}>{saveLabel}</span>
            <button
              onClick={handleManualSave}
              disabled={saveStatus === 'saving'}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-yellow-900 transition-colors disabled:opacity-60"
            >
              <Save size={11} /> Save
            </button>
            <button
              onClick={handleClose}
              className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Migration missing warning */}
        {migrationMissing && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
            <strong>Migration 011 not applied.</strong> Run{' '}
            <code className="font-mono">supabase/migrations/011_main_note.sql</code> in the
            Supabase SQL editor to enable note saving.
          </div>
        )}

        {/* Legal-pad textarea */}
        <div className="flex-1 overflow-hidden">
          <textarea
            value={text}
            onChange={handleChange}
            placeholder={`Notes for ${leadName}…`}
            className="w-full h-full resize-none bg-transparent px-5 py-4 text-sm text-gray-800 leading-7 focus:outline-none placeholder:text-yellow-300"
            style={{
              backgroundImage:
                'repeating-linear-gradient(transparent, transparent 27px, #fde68a 27px, #fde68a 28px)',
              backgroundSize: '100% 28px',
              backgroundPositionY: '4px',
            }}
            aria-label={`Main note for ${leadName}`}
            autoFocus
          />
        </div>

        {/* Previous activity notes (collapsed) */}
        {prevNotes.length > 0 && (
          <div className="border-t border-yellow-200">
            <button
              onClick={() => setPrevOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-yellow-700 hover:bg-yellow-100 transition-colors"
            >
              <span className="font-medium">
                Previous notes ({prevNotes.length})
              </span>
              {prevOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {prevOpen && (
              <div className="max-h-52 overflow-y-auto divide-y divide-yellow-100 bg-yellow-50">
                {prevNotes.map(n => (
                  <div key={n.id} className="px-4 py-3">
                    <p className="text-[11px] text-yellow-600 mb-1">
                      {fmtDatetime(n.occurred_at)}
                    </p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">
                      {n.notes ?? '(empty)'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
