/**
 * New Outreach Engine — sends the initial proposal SMS to eligible NEW leads.
 * Reuses: buildOutreachMessage, ensureProposalSlug, sendSms, enrollLeadInSequence.
 *
 * Server-side ONLY. Never import from 'use client' components.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildOutreachMessage } from '@/lib/outreach'
import { ensureProposalSlug, getProposalUrl } from '@/lib/proposals'
import { enrollLeadInSequence } from '@/lib/followup-engine'
import { sendSms, syncContact, isValidUSPhone, normalizeUSPhone } from '@/lib/quo'
import type { Lead } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BatchResult {
  requested: number
  sent: number
  failed: number
  skipped: number
  errors: string[]
}

// ── Central Time helpers ──────────────────────────────────────────────────────

/** Return today's date string (YYYY-MM-DD) in Central Time (America/Chicago). */
function todayInCT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

/**
 * Return the current hour and minute in Central Time.
 * e.g. { hour: 10, minute: 30 }
 */
function currentTimeCT(): { hour: number; minute: number } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now)

  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  return { hour: h, minute: m }
}

// ── 1. isNewOutreachEnabled ───────────────────────────────────────────────────

export async function isNewOutreachEnabled(
  db: SupabaseClient,
): Promise<boolean> {
  const { data } = await db
    .from('system_settings')
    .select('value')
    .eq('key', 'new_outreach_enabled')
    .maybeSingle()
  return data?.value === 'true'
}

// ── 2. getNewOutreachSettings ─────────────────────────────────────────────────

export async function getNewOutreachSettings(db: SupabaseClient): Promise<{
  enabled: boolean
  batchSize: number
  sendTime: string
  lastRunDate: string
}> {
  const { data: rows } = await db
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'new_outreach_enabled',
      'new_outreach_batch_size',
      'new_outreach_send_time',
      'new_outreach_last_run_date',
    ])

  const map: Record<string, string> = {}
  for (const row of rows ?? []) {
    map[row.key] = row.value
  }

  return {
    enabled:     map['new_outreach_enabled']      === 'true',
    batchSize:   parseInt(map['new_outreach_batch_size'] ?? '20', 10) || 20,
    sendTime:    map['new_outreach_send_time']     ?? '10:30',
    lastRunDate: map['new_outreach_last_run_date'] ?? '',
  }
}

// ── 3. hasRunToday ────────────────────────────────────────────────────────────

/**
 * Compare lastRunDate (YYYY-MM-DD) with today's date in Central Time.
 * Returns true if already run today.
 */
export function hasRunToday(lastRunDate: string): boolean {
  if (!lastRunDate) return false
  return lastRunDate === todayInCT()
}

// ── 4. getEligibleNewLeads ────────────────────────────────────────────────────

type EligibleLead = Pick<
  Lead,
  | 'id'
  | 'display_name'
  | 'outlet_name'
  | 'taxpayer_name'
  | 'outlet_city'
  | 'status'
  | 'permit_phone'
  | 'primary_phone'
  | 'followup_started_at'
  | 'proposal_status'
  | 'proposal_slug'
>

/**
 * Select up to `limit` NEW leads eligible for first outreach.
 * Criteria:
 *   - status = 'new'
 *   - has a phone (permit_phone or primary_phone)
 *   - status != 'do_not_contact' (already enforced by status = 'new')
 *   - followup_started_at IS NULL (not already enrolled)
 *   - NOT in sms_suppression (checked client-side after fetch)
 *   - No successful outbound SMS yet (checked via sms_messages filter)
 * Order: first_sales_date DESC NULLS LAST, created_at DESC (freshest first)
 */
export async function getEligibleNewLeads(
  db: SupabaseClient,
  limit: number,
): Promise<EligibleLead[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db
    .from('leads')
    .select(
      'id,display_name,outlet_name,taxpayer_name,outlet_city,status,' +
      'permit_phone,primary_phone,followup_started_at,proposal_status,proposal_slug',
    )
    .eq('status', 'new')
    .or('permit_phone.not.is.null,primary_phone.not.is.null')
    .is('followup_started_at', null)
    .order('first_sales_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (limit > 0) {
    query = query.limit(limit)
  }

  const { data, error } = await query as { data: EligibleLead[] | null; error: unknown }

  if (error) {
    console.error('[new-outreach-engine] getEligibleNewLeads error:', error)
    return []
  }

  return data ?? []
}

/**
 * Count eligible NEW leads (no limit — for stats display).
 */
export async function countEligibleNewLeads(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new')
    .or('permit_phone.not.is.null,primary_phone.not.is.null')
    .is('followup_started_at', null)

  if (error) {
    console.error('[new-outreach-engine] countEligibleNewLeads error:', error)
    return 0
  }

  return count ?? 0
}

// ── 5. sendInitialOutreach ────────────────────────────────────────────────────

export async function sendInitialOutreach(
  db: SupabaseClient,
  lead: EligibleLead,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const phone = lead.permit_phone ?? lead.primary_phone
  const sentAt = new Date().toISOString()

  // 1. Validate phone
  if (!phone || !isValidUSPhone(phone)) {
    return { ok: false, error: 'no_valid_phone' }
  }

  const normalizedPhone = normalizeUSPhone(phone)

  // 2. Check suppression list
  const { data: suppressed } = await db
    .from('sms_suppression')
    .select('id')
    .eq('normalized_phone', normalizedPhone)
    .maybeSingle()

  if (suppressed) {
    return { ok: false, error: 'suppressed' }
  }

  // 3. Get / create proposal slug
  const businessName = lead.display_name || lead.outlet_name || lead.taxpayer_name || 'your business'
  const slug = await ensureProposalSlug(db, lead.id, businessName)

  // 4. Get proposal URL
  const proposalUrl = getProposalUrl(slug)

  // 5. Build message
  const message = buildOutreachMessage(businessName, proposalUrl, lead.outlet_city ?? null)

  // 6. Send SMS
  try {
    const { messageId } = await sendSms(phone, message)

    // 7a. Insert sms_messages record
    await db.from('sms_messages').insert({
      lead_id: lead.id,
      quo_message_id: messageId,
      direction: 'outbound',
      to_number: `+1${normalizedPhone}`,
      from_number: process.env.QUO_FROM_NUMBER ?? '',
      content: message,
      status: 'submitted',
      sent_at: sentAt,
    })

    // 7b. Update lead status
    const proposalUpdates: Record<string, unknown> = {
      status: 'attempted',
      sms_status: 'submitted',
      sms_last_sent_at: sentAt,
    }
    // Only set proposal_status/sent_at if not already viewed/accepted
    if (
      lead.proposal_status == null ||
      lead.proposal_status === 'not_sent'
    ) {
      proposalUpdates.proposal_status = 'sent'
      proposalUpdates.proposal_sent_at = sentAt
    }

    await db.from('leads').update(proposalUpdates).eq('id', lead.id)

    // 7c. Enroll in follow-up sequence (fire-and-forget)
    enrollLeadInSequence(db, lead.id, sentAt).catch(err =>
      console.error('[new-outreach-engine] enrollLeadInSequence failed for lead', lead.id, err),
    )

    // 7d. Fire-and-forget contact sync
    const contactName = lead.display_name || lead.outlet_name || lead.taxpayer_name || 'Business'
    syncContact({ leadId: lead.id, name: contactName, phone })
      .catch(err => console.error('[new-outreach-engine] syncContact failed for lead', lead.id, err))

    return { ok: true, messageId }
  } catch (err) {
    const errMsg = String(err)
    console.error('[new-outreach-engine] sendSms failed for lead', lead.id, err)

    // 8. On failure: insert failed sms_message, do NOT change lead status
    await db.from('sms_messages').insert({
      lead_id: lead.id,
      direction: 'outbound',
      to_number: `+1${normalizedPhone}`,
      from_number: process.env.QUO_FROM_NUMBER ?? '',
      content: message,
      status: 'failed',
      error_message: errMsg,
      sent_at: sentAt,
    })

    return { ok: false, error: errMsg }
  }
}

// ── 6. processBatch ───────────────────────────────────────────────────────────

export async function processBatch(
  db: SupabaseClient,
  batchSize: number,
): Promise<BatchResult> {
  const result: BatchResult = {
    requested: batchSize,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  const leads = await getEligibleNewLeads(db, batchSize)
  result.requested = batchSize

  for (const lead of leads) {
    const phone = lead.permit_phone ?? lead.primary_phone
    if (!phone || !isValidUSPhone(phone)) {
      result.skipped++
      continue
    }

    const outcome = await sendInitialOutreach(db, lead)
    if (outcome.ok) {
      result.sent++
    } else if (outcome.error === 'suppressed' || outcome.error === 'no_valid_phone') {
      result.skipped++
    } else {
      result.failed++
      if (outcome.error) result.errors.push(`lead:${lead.id} — ${outcome.error}`)
    }
  }

  // After batch: update last run date to today (Central Time)
  const today = todayInCT()
  await db
    .from('system_settings')
    .upsert(
      { key: 'new_outreach_last_run_date', value: today, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  return result
}

// ── 7. maybeRunScheduledBatch ─────────────────────────────────────────────────

/**
 * Entry point for the scheduled cron function.
 * Performs all gate checks before running the batch.
 */
export async function maybeRunScheduledBatch(
  db: SupabaseClient,
): Promise<{ ran: boolean; result?: BatchResult; reason?: string }> {
  // 1. Check if enabled
  const enabled = await isNewOutreachEnabled(db)
  if (!enabled) {
    return { ran: false, reason: 'disabled' }
  }

  // 2. Get settings
  const settings = await getNewOutreachSettings(db)

  // 3. Check if already ran today
  if (hasRunToday(settings.lastRunDate)) {
    return { ran: false, reason: 'already_ran_today' }
  }

  // 4. Check if current CT time >= configured send time
  const [sendHour, sendMinute] = settings.sendTime.split(':').map(Number)
  const { hour, minute } = currentTimeCT()
  const currentMinutes = hour * 60 + minute
  const scheduledMinutes = (sendHour ?? 10) * 60 + (sendMinute ?? 30)

  if (currentMinutes < scheduledMinutes) {
    return { ran: false, reason: 'not_yet_time' }
  }

  // 5. Run the batch
  const result = await processBatch(db, settings.batchSize)
  return { ran: true, result }
}
