/**
 * Sales follow-up engine — single source of truth for all follow-up logic.
 * Used by both the Netlify scheduled function and the manual "Send Now" UI action.
 *
 * Server-side ONLY. Never import from 'use client' components.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSms } from '@/lib/quo'
import { normalizeUSPhone, isValidUSPhone } from '@/lib/quo'
import { getProposalUrl } from '@/lib/proposals'
import type { Lead } from '@/lib/types'

export const DAILY_LIMIT = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayMidnightUTC(): string {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString()
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

// ── 1. isFollowupEnabled ──────────────────────────────────────────────────────

export async function isFollowupEnabled(
  db: SupabaseClient,
): Promise<boolean> {
  const { data } = await db
    .from('system_settings')
    .select('value')
    .eq('key', 'sales_followup_enabled')
    .maybeSingle()
  return data?.value === 'true'
}

// ── 2. checkStopConditions ────────────────────────────────────────────────────

export function checkStopConditions(
  lead: Pick<
    Lead,
    | 'status'
    | 'sms_needs_reply'
    | 'proposal_status'
    | 'followup_completed_at'
  >,
): { stop: boolean; reason: string } {
  if (lead.status === 'won') return { stop: true, reason: 'lead_won' }
  if (lead.status === 'lost') return { stop: true, reason: 'lead_lost' }
  if (lead.status === 'do_not_contact') return { stop: true, reason: 'do_not_contact' }
  if (lead.sms_needs_reply) return { stop: true, reason: 'sms_needs_reply' }
  if (
    lead.proposal_status === 'agreement_requested' ||
    lead.proposal_status === 'accepted'
  )
    return { stop: true, reason: 'proposal_accepted' }
  if (lead.followup_completed_at) return { stop: true, reason: 'sequence_complete' }
  return { stop: false, reason: '' }
}

// ── 3. buildFollowupMessage ───────────────────────────────────────────────────

/**
 * Returns the follow-up message for a given step (1-indexed).
 * If `template` is provided (from system_settings), placeholders are replaced.
 * Otherwise falls back to hardcoded defaults.
 *
 * @param step 1 | 2 | 3
 * @param businessName Lead's business name
 * @param proposalUrl  Proposal URL (used in step 2 default and {PROPOSAL_URL} placeholder)
 * @param city         Lead's city (used in {CITY} placeholder)
 * @param template     Optional message template from system_settings
 */
export function buildFollowupMessage(
  step: number,
  businessName: string,
  proposalUrl?: string | null,
  city?: string | null,
  template?: string | null,
): string {
  if (template) {
    return template
      .replace(/\{BUSINESS_NAME\}/g, businessName?.trim() || 'your business')
      .replace(/\{CITY\}/g, city?.trim() || 'your area')
      .replace(/\{PROPOSAL_URL\}/g, proposalUrl ?? '')
  }

  // Hardcoded defaults
  const name = businessName?.trim() || 'your business'
  if (step === 1) {
    return `Hi, just wanted to make sure you received the proposal I sent over for ${name}. I'm here if you have any questions.\n\nJordan`
  }
  if (step === 2) {
    const url = proposalUrl ?? ''
    return `Hi, Jordan again from Process Direct. If you're still getting your payment setup handled, we can help get everything ready and include the POS system at no cost.\n\nHere's your proposal again:\n${url}\n\nJordan`
  }
  // Step 3 (final)
  return `Hi, just checking one last time before I close this out. Have you already handled your POS and card processing for ${name}?\n\nJordan`
}

// ── Step delay schedule ────────────────────────────────────────────────────────

/** Days to wait after the PREVIOUS step before sending the NEXT step. */
const STEP_DELAY_DAYS: Record<number, number> = {
  1: 1,  // initial → step 1: 1 day after first outreach
  2: 2,  // step 1 → step 2: 2 days later
  3: 4,  // step 2 → step 3: 4 days later
}

// ── 4. processDueLeads ────────────────────────────────────────────────────────

export interface ProcessResult {
  processed: number
  sent: number
  skipped: number
  errors: number
  dailyLimitReached: boolean
}

export async function processDueLeads(
  db: SupabaseClient,
  options?: { limit?: number; leadId?: string },
): Promise<ProcessResult> {
  const result: ProcessResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    dailyLimitReached: false,
  }

  // Check if automation is enabled
  const enabled = await isFollowupEnabled(db)
  if (!enabled) {
    console.log('[followup-engine] Sales follow-up is disabled — skipping')
    return result
  }

  // Count outbound SMS sent today
  const { count: sentToday } = await db
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('direction', 'outbound')
    .gte('sent_at', todayMidnightUTC())

  const dailyUsed = sentToday ?? 0
  if (dailyUsed >= DAILY_LIMIT) {
    result.dailyLimitReached = true
    console.log(`[followup-engine] Daily limit of ${DAILY_LIMIT} already reached`)
    return result
  }

  const now = new Date()

  // Fetch message templates from system_settings (in parallel)
  const [msg1Row, msg2Row, msg3Row] = await Promise.all([
    db.from('system_settings').select('value').eq('key', 'sales_followup_message_1').maybeSingle(),
    db.from('system_settings').select('value').eq('key', 'sales_followup_message_2').maybeSingle(),
    db.from('system_settings').select('value').eq('key', 'sales_followup_message_3').maybeSingle(),
  ])
  const templates: Record<number, string | null> = {
    1: msg1Row.data?.value ?? null,
    2: msg2Row.data?.value ?? null,
    3: msg3Row.data?.value ?? null,
  }

  type DueLead = Pick<Lead,
    | 'id' | 'display_name' | 'outlet_name' | 'outlet_city' | 'status' | 'permit_phone' | 'primary_phone'
    | 'sms_needs_reply' | 'proposal_status' | 'followup_step' | 'followup_completed_at'
    | 'followup_started_at' | 'proposal_slug'
  >

  // Build query for due leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = db
    .from('leads')
    .select(
      'id,display_name,outlet_name,outlet_city,status,permit_phone,primary_phone,sms_needs_reply,' +
      'proposal_status,followup_step,followup_completed_at,followup_started_at,proposal_slug',
    )
    .lte('next_follow_up_at', now.toISOString())
    .is('followup_completed_at', null)
    .not('status', 'in', '(won,lost,do_not_contact)')
    .not('proposal_status', 'in', '(agreement_requested,accepted)')
    .order('next_follow_up_at', { ascending: true })

  // Single-lead mode (send-now)
  if (options?.leadId) {
    query = query.eq('id', options.leadId)
  }

  const maxToProcess = Math.min(
    options?.limit ?? DAILY_LIMIT,
    DAILY_LIMIT - dailyUsed,
  )
  if (maxToProcess <= 0) {
    result.dailyLimitReached = true
    return result
  }

  query = query.limit(maxToProcess)

  // Filter sms_needs_reply server-side if Supabase filter isn't available
  const { data: dueLeads, error: fetchError } = await query as { data: DueLead[] | null; error: unknown }

  if (fetchError) {
    console.error('[followup-engine] Error fetching due leads:', fetchError)
    result.errors++
    return result
  }

  const leads = (dueLeads ?? []).filter(l => !l.sms_needs_reply)

  for (const lead of leads) {
    result.processed++

    // Check stop conditions
    const { stop, reason } = checkStopConditions(lead as unknown as Lead)
    if (stop) {
      console.log(`[followup-engine] Skipping lead ${lead.id}: ${reason}`)
      result.skipped++
      // Clear next_follow_up_at if stopping
      await db
        .from('leads')
        .update({ next_follow_up_at: null, followup_completed_at: new Date().toISOString() })
        .eq('id', lead.id)
      continue
    }

    // Check suppression
    const phone = lead.permit_phone ?? lead.primary_phone
    if (!phone || !isValidUSPhone(phone)) {
      console.log(`[followup-engine] Skipping lead ${lead.id}: no valid phone`)
      result.skipped++
      continue
    }

    const normalizedPhone = normalizeUSPhone(phone)
    const { data: suppressed } = await db
      .from('sms_suppression')
      .select('id')
      .eq('normalized_phone', normalizedPhone)
      .maybeSingle()

    if (suppressed) {
      console.log(`[followup-engine] Skipping lead ${lead.id}: phone suppressed`)
      result.skipped++
      // Mark automation done for suppressed
      await db
        .from('leads')
        .update({ next_follow_up_at: null, followup_completed_at: new Date().toISOString() })
        .eq('id', lead.id)
      continue
    }

    // Determine next step (0-indexed stored → 1-indexed messages)
    const currentStep = lead.followup_step ?? 0
    const nextStep = currentStep + 1

    if (nextStep > 3) {
      // Sequence exhausted
      await db
        .from('leads')
        .update({ next_follow_up_at: null, followup_completed_at: new Date().toISOString() })
        .eq('id', lead.id)
      result.skipped++
      continue
    }

    // Get proposal URL for step 2
    let proposalUrl: string | null = null
    if (nextStep === 2 && lead.proposal_slug) {
      proposalUrl = getProposalUrl(lead.proposal_slug)
    }

    const businessName = lead.display_name || lead.outlet_name || 'your business'
    const city = (lead as unknown as { outlet_city?: string | null }).outlet_city ?? null
    const message = buildFollowupMessage(nextStep, businessName, proposalUrl, city, templates[nextStep])

    const sentAt = new Date().toISOString()

    try {
      const { messageId } = await sendSms(phone, message)

      // Record in sms_messages
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

      // Calculate next_follow_up_at (null for last step)
      const isLastStep = nextStep === 3
      const nextFollowUpAt = isLastStep
        ? null
        : addDays(new Date(sentAt), STEP_DELAY_DAYS[nextStep + 1] ?? 3).toISOString()

      // Update lead
      await db
        .from('leads')
        .update({
          followup_step: nextStep,
          last_followup_sent_at: sentAt,
          sms_status: 'submitted',
          sms_last_sent_at: sentAt,
          next_follow_up_at: nextFollowUpAt,
          ...(isLastStep
            ? { followup_completed_at: sentAt }
            : {}),
        })
        .eq('id', lead.id)

      result.sent++
      console.log(`[followup-engine] Sent step ${nextStep} to lead ${lead.id}`)

      // Check if we've hit the daily limit
      if (dailyUsed + result.sent >= DAILY_LIMIT) {
        result.dailyLimitReached = true
        break
      }
    } catch (err) {
      console.error(`[followup-engine] Error sending to lead ${lead.id}:`, err)
      result.errors++

      // Record failed attempt
      await db.from('sms_messages').insert({
        lead_id: lead.id,
        direction: 'outbound',
        to_number: `+1${normalizedPhone}`,
        from_number: process.env.QUO_FROM_NUMBER ?? '',
        content: message,
        status: 'failed',
        error_message: String(err),
        sent_at: sentAt,
      })
    }
  }

  return result
}

// ── 5. enrollLeadInSequence ───────────────────────────────────────────────────

/**
 * Enroll a lead in the follow-up sequence after the FIRST manual SMS.
 * Sets next_follow_up_at to sentAt + 1 day.
 * Only enrolls if not already enrolled.
 */
export async function enrollLeadInSequence(
  db: SupabaseClient,
  leadId: string,
  sentAt: string,
): Promise<void> {
  // Only enroll if not already enrolled
  const { data: lead } = await db
    .from('leads')
    .select('followup_started_at, followup_step')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return

  // Already enrolled — skip
  if (lead.followup_started_at) return

  const nextFollowUpAt = addDays(new Date(sentAt), STEP_DELAY_DAYS[1]).toISOString()

  await db
    .from('leads')
    .update({
      followup_step: 0,
      followup_started_at: sentAt,
      followup_completed_at: null,
      next_follow_up_at: nextFollowUpAt,
    })
    .eq('id', leadId)
}

// ── 6. stopAutomationForLead ──────────────────────────────────────────────────

/**
 * Stop the follow-up sequence for a specific lead.
 * Clears next_follow_up_at and sets followup_completed_at.
 */
export async function stopAutomationForLead(
  db: SupabaseClient,
  leadId: string,
): Promise<void> {
  await db
    .from('leads')
    .update({
      next_follow_up_at: null,
      followup_completed_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .is('followup_completed_at', null) // Only update if not already stopped
}

export { isValidUSPhone, normalizeUSPhone }
