/**
 * GET  /api/settings/sms-sequence — returns { initial, message1, message2, message3 }
 * POST /api/settings/sms-sequence — upserts system_settings including Initial SMS
 * PATCH is an alias for POST.
 *
 * Auth: requires mr_admin session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { verifySessionToken, SESSION_COOKIE } from '@/lib/session'
import {
  INITIAL_OUTREACH_SETTING_KEY,
  INITIAL_SMS_TEMPLATE,
  getInitialOutreachTemplate,
  isInitialSmsCompliant,
} from '@/lib/outreach'

const DEFAULT_MESSAGES: Record<'initial' | 'message1' | 'message2' | 'message3', string> = {
  initial: INITIAL_SMS_TEMPLATE,
  message1:
    'Hi, just wanted to make sure you received the proposal I sent over for {BUSINESS_NAME}. I\'m here if you have any questions.\n\nJordan',
  message2:
    'Hi, Jordan again from Process Direct. If you\'re still getting your payment setup handled, we can help get everything ready and include the POS system at no cost.\n\nHere\'s your proposal again:\n{PROPOSAL_URL}\n\nJordan',
  message3:
    'Hi, just checking one last time before I close this out. Have you already handled your POS and card processing for {BUSINESS_NAME}?\n\nJordan',
}

const KEY_MAP = {
  initial:  INITIAL_OUTREACH_SETTING_KEY,
  message1: 'sales_followup_message_1',
  message2: 'sales_followup_message_2',
  message3: 'sales_followup_message_3',
} as const

async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return false
  return verifySessionToken(token)
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const { data: rows } = await db
    .from('system_settings')
    .select('key, value')
    .in('key', Object.values(KEY_MAP))

  const rowMap: Record<string, string> = {}
  for (const row of rows ?? []) {
    rowMap[row.key] = row.value
  }

  const initial = await getInitialOutreachTemplate(db)
  if (rowMap[KEY_MAP.initial] !== initial) {
    await db.from('system_settings').upsert(
      {
        key: KEY_MAP.initial,
        value: initial,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  }

  return NextResponse.json({
    initial,
    message1: rowMap[KEY_MAP.message1] ?? DEFAULT_MESSAGES.message1,
    message2: rowMap[KEY_MAP.message2] ?? DEFAULT_MESSAGES.message2,
    message3: rowMap[KEY_MAP.message3] ?? DEFAULT_MESSAGES.message3,
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { initial?: string; message1?: string; message2?: string; message3?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const db = createServiceClient()
  const now = new Date().toISOString()

  if (typeof body.initial === 'string') {
    if (!isInitialSmsCompliant(body.initial, '{PROPOSAL_URL}')) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Initial SMS must include “Reply STOP to opt out.” immediately before {PROPOSAL_URL}, and {PROPOSAL_URL} must be the last line.',
        },
        { status: 400 },
      )
    }
  }

  const upserts: Array<{ key: string; value: string; updated_at: string }> = []

  for (const [field, dbKey] of Object.entries(KEY_MAP) as Array<[keyof typeof KEY_MAP, string]>) {
    const val = body[field]
    if (typeof val === 'string') {
      upserts.push({ key: dbKey, value: val, updated_at: now })
    }
  }

  if (upserts.length === 0) {
    return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await db
    .from('system_settings')
    .upsert(upserts, { onConflict: 'key' })

  if (error) {
    console.error('[settings/sms-sequence] DB error:', error)
    return NextResponse.json({ ok: false, error: 'Failed to update settings' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// PATCH is an alias for POST
export { POST as PATCH }
