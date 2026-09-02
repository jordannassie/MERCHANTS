import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from 'date-fns'
import type { LeadStatus, LeadPriority } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date formatting ──────────────────────────────────────────────────────────

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return format(new Date(iso), 'MMM d, yyyy') } catch { return '—' }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return format(new Date(iso), 'MMM d, yyyy h:mm a') } catch { return '—' }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }) } catch { return '—' }
}

export function isFollowUpOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false
  try { return isPast(new Date(iso)) && !isToday(new Date(iso)) } catch { return false }
}

export function followUpLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isToday(d)) return 'Today'
    if (isTomorrow(d)) return 'Tomorrow'
    if (isPast(d)) return `Overdue — ${fmtDate(iso)}`
    return fmtDate(iso)
  } catch { return '—' }
}

// ─── Phone formatting ─────────────────────────────────────────────────────────

export function fmtPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return raw
}

// ─── Status/priority labels ───────────────────────────────────────────────────

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  attempted: 'Attempted',
  connected: 'Connected',
  follow_up: 'Follow-up',
  appointment: 'Appointment',
  won: 'Won',
  lost: 'Lost',
  do_not_contact: 'Do Not Contact',
}

export const PRIORITY_LABELS: Record<LeadPriority, string> = {
  hot: 'Hot',
  good: 'Good',
  low: 'Low',
  skip: 'Skip',
}

export const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-gray-100 text-gray-700',
  attempted: 'bg-yellow-50 text-yellow-700',
  connected: 'bg-blue-50 text-blue-700',
  follow_up: 'bg-orange-50 text-orange-700',
  appointment: 'bg-purple-50 text-purple-700',
  won: 'bg-green-50 text-green-700',
  lost: 'bg-red-50 text-red-700',
  do_not_contact: 'bg-red-100 text-red-800',
}

export const PRIORITY_COLORS: Record<LeadPriority, string> = {
  hot: 'bg-red-50 text-red-700',
  good: 'bg-orange-50 text-orange-700',
  low: 'bg-gray-100 text-gray-600',
  skip: 'bg-gray-50 text-gray-400',
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

export function buildMapsUrl(name: string, address: string, city: string, state: string): string {
  const q = encodeURIComponent(`${name} ${address} ${city} ${state}`)
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const u = url.trim()
  if (!u) return null
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n')
}

/**
 * Safely parse a fetch Response as JSON.
 * If the server returns HTML (e.g., a 502/504 gateway error page), this
 * throws a clean Error rather than letting JSON.parse crash with
 * "Unexpected token '<'".
 */
export async function safeJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Server error (HTTP ${res.status}) — response was not JSON`)
  }
}
