/**
 * sweep-state.ts — server-only helpers for Google daily leads sweep.
 *
 * Manages:
 *   - active sweep record in google_sweeps (task position, daily counters)
 *   - system_settings (ON/OFF toggle)
 *   - daily counter reset when calendar date changes
 *
 * Never import this in 'use client' files.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { generateSweepTasks, type SweepTask } from '@/lib/google-categories'

// ── Constants ─────────────────────────────────────────────────────────────────
export const TASKS = generateSweepTasks()          // 315 deterministic tasks
export const TASKS_TOTAL = TASKS.length            // 315

/** New callable leads to add per day before stopping. */
export const DAILY_GOAL       = 90
/** Max Google searches per day (reserves 10 of quota for testing/other use). */
export const DAILY_SEARCH_LIMIT = Number(process.env.GOOGLE_DAILY_SEARCH_LIMIT ?? 90)
/** Max tasks to process per single server invocation (safety for Netlify timeouts). */
export const MAX_TASKS_PER_BATCH = 5
/** Soft time budget per batch invocation (milliseconds). */
export const BATCH_TIME_BUDGET_MS = 20_000   // 20 s — leaves buffer in 26 s Netlify limit
/** Days before a phone-less result is eligible for re-check. */
export const RECHECK_DAYS = 30

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SweepRecord {
  id: string
  status: string
  task_index: number
  tasks_total: number
  new_leads: number           // all-time
  enriched: number            // all-time
  new_leads_today: number
  searches_today: number
  last_run_date: string | null
  last_run_at: string | null
  last_complete_cycle_at: string | null
  started_at: string
}

// ── DB helpers ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

export function db(): ReturnType<typeof createServiceClient> {
  return createServiceClient()
}

/** Get the system_settings value for a key. Returns null if not found. */
export async function getSetting(key: string): Promise<string | null> {
  const { data } = await (db() as AnyDb).from('system_settings').select('value').eq('key', key).maybeSingle()
  return (data as { value: string } | null)?.value ?? null
}

/** Set a system_settings value. */
export async function setSetting(key: string, value: string): Promise<void> {
  await (db() as AnyDb).from('system_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/** Count today's Google searches from google_search_runs. */
export async function countSearchesToday(): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { count } = await (db() as AnyDb)
    .from('google_search_runs')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', todayStart.toISOString())
  return count ?? 0
}

/**
 * Get or create the active sweep record.
 * Automatically resets daily counters when the calendar date changes.
 */
export async function getOrCreateSweep(): Promise<SweepRecord> {
  const database = db() as AnyDb

  // Try to find an active sweep
  const { data: existing } = await database
    .from('google_sweeps')
    .select('id, status, task_index, tasks_total, new_leads, enriched, new_leads_today, searches_today, last_run_date, last_run_at, last_complete_cycle_at, started_at')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const todayStr = new Date().toISOString().slice(0, 10)  // 'YYYY-MM-DD'

  if (existing) {
    // Reset daily counters if the date has rolled over
    if (existing.last_run_date !== todayStr) {
      await database.from('google_sweeps').update({
        new_leads_today: 0,
        searches_today: 0,
        last_run_date: todayStr,
      }).eq('id', existing.id)
      existing.new_leads_today = 0
      existing.searches_today = 0
      existing.last_run_date = todayStr
    }
    return existing as SweepRecord
  }

  // Create a new sweep cycle
  const { data: created } = await database
    .from('google_sweeps')
    .insert({
      status:           'running',
      sweep_type:       'statewide',
      state:            'TX',
      task_index:       0,
      tasks_total:      TASKS_TOTAL,
      new_leads:        0,
      enriched:         0,
      new_leads_today:  0,
      searches_today:   0,
      last_run_date:    todayStr,
      started_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    })
    .select()
    .single()

  return created as SweepRecord
}

/** Advance task_index and update daily/all-time counters. */
export async function saveSweepProgress(sweepId: string, opts: {
  taskIndexNext: number
  newLeadsAdded: number
  enrichedAdded: number
  searchesUsed:  number
  lastCompleteAt?: string  // set when a full cycle just completed
}): Promise<void> {
  const todayStr = new Date().toISOString().slice(0, 10)
  const database = db() as AnyDb

  await database.from('google_sweeps').update({
    task_index:     opts.taskIndexNext,
    last_run_at:    new Date().toISOString(),
    last_run_date:  todayStr,
    updated_at:     new Date().toISOString(),
    // Increment counters using raw SQL isn't directly available via PostgREST,
    // so we fetch current values and add — handled by the caller passing absolute values
    ...(opts.lastCompleteAt ? { last_complete_cycle_at: opts.lastCompleteAt } : {}),
  }).eq('id', sweepId)
}

/** Get the next task for this sweep, or null if the cycle is complete. */
export function getTask(taskIndex: number): SweepTask | null {
  if (taskIndex >= TASKS_TOTAL) return null
  return TASKS[taskIndex]
}

/** Compute next 12:00 UTC run time. */
export function nextRunAt(): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0))
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}
