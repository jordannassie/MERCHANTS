/**
 * QUO SMS API client — server-side ONLY.
 * Never import this module from any 'use client' component.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { normalizeUSPhone, isValidUSPhone } from '@/lib/source-utils'

export const QUO_API_VERSION = '2026-03-30'
const QUO_BASE_URL = 'https://api.quo.com/v1'

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Returns base headers required for every QUO API call. Throws if key is absent. */
export function quoHeaders(): Record<string, string> {
  const key = process.env.QUO_API_KEY
  if (!key) throw new Error('QUO_API_KEY is not configured')
  return {
    Authorization: key,
    'Quo-Api-Version': QUO_API_VERSION,
    'Content-Type': 'application/json',
  }
}

/** Convert a phone string to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
function toE164(phone: string): string | null {
  const normalized = normalizeUSPhone(phone)
  if (!normalized || normalized.length !== 10) return null
  return `+1${normalized}`
}

// ── Send SMS ──────────────────────────────────────────────────────────────────

export async function sendSms(
  to: string,
  content: string
): Promise<{ messageId: string }> {
  const fromNumber = process.env.QUO_FROM_NUMBER
  if (!fromNumber) throw new Error('QUO_FROM_NUMBER is not configured')

  const toE164Num = toE164(to)
  if (!toE164Num) throw new Error(`Invalid phone number: cannot convert to E.164`)

  let res: Response
  try {
    res = await fetch(`${QUO_BASE_URL}/messages`, {
      method: 'POST',
      headers: quoHeaders(),
      body: JSON.stringify({ from: fromNumber, to: [toE164Num], content }),
    })
  } catch (err) {
    console.error('[quo] sendSms network error:', err)
    throw new Error('SMS sending failed — please try again')
  }

  if (res.status !== 202) {
    let detail = ''
    try { detail = await res.text() } catch {}
    console.error(`[quo] sendSms non-202 response: ${res.status}`, detail)
    throw new Error('SMS sending failed — please try again')
  }

  let body: { data?: { id?: string } }
  try { body = await res.json() } catch {
    throw new Error('SMS sending failed — please try again')
  }

  const messageId = body?.data?.id
  if (!messageId) throw new Error('SMS sending failed — no message ID returned')

  return { messageId }
}

// ── Sync contact ──────────────────────────────────────────────────────────────

export async function syncContact(opts: {
  leadId: string
  name: string
  phone: string
}): Promise<{ quoContactId: string }> {
  const { leadId, name, phone } = opts
  const phoneE164 = toE164(phone)
  if (!phoneE164) throw new Error(`Invalid phone for contact sync: ${phone}`)

  const headers = quoHeaders()

  // Look up existing contact by externalId
  let searchRes: Response
  try {
    const url = `${QUO_BASE_URL}/contacts?${new URLSearchParams({
      'externalIds[]': leadId,
      'sources[]': 'merchant-radar',
    }).toString()}`
    searchRes = await fetch(url, { method: 'GET', headers })
  } catch (err) {
    console.error('[quo] syncContact search error:', err)
    throw new Error('Contact sync failed')
  }

  const contactBody: Record<string, unknown> = {
    defaultFields: {
      firstName: name,
      phoneNumbers: [{ value: phoneE164 }],
    },
  }

  if (searchRes.ok) {
    let searchData: { data?: Array<{ id?: string }> }
    try { searchData = await searchRes.json() } catch { searchData = {} }

    const existing = searchData?.data?.[0]
    if (existing?.id) {
      // PATCH existing contact
      let patchRes: Response
      try {
        patchRes = await fetch(`${QUO_BASE_URL}/contacts/${existing.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(contactBody),
        })
      } catch (err) {
        console.error('[quo] syncContact patch error:', err)
        throw new Error('Contact sync failed')
      }
      if (!patchRes.ok) {
        const detail = await patchRes.text().catch(() => '')
        console.error('[quo] syncContact patch non-ok:', patchRes.status, detail)
        throw new Error('Contact sync failed')
      }
      return { quoContactId: existing.id }
    }
  }

  // POST new contact
  const createBody = {
    ...contactBody,
    externalId: leadId,
    source: 'merchant-radar',
  }

  let createRes: Response
  try {
    createRes = await fetch(`${QUO_BASE_URL}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createBody),
    })
  } catch (err) {
    console.error('[quo] syncContact create error:', err)
    throw new Error('Contact sync failed')
  }

  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '')
    console.error('[quo] syncContact create non-ok:', createRes.status, detail)
    throw new Error('Contact sync failed')
  }

  let createData: { data?: { id?: string } }
  try { createData = await createRes.json() } catch { createData = {} }

  const quoContactId = createData?.data?.id
  if (!quoContactId) throw new Error('Contact sync failed — no contact ID returned')

  return { quoContactId }
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verify a Standard-Webhooks (Svix-compatible) signature.
 * Returns false on any error — never throws.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: {
    id: string
    timestamp: string
    signature: string
    secret: string
  }
): boolean {
  try {
    const { id, timestamp, signature, secret } = headers

    if (!id || !timestamp || !signature || !secret) return false

    // Reject if timestamp is > 5 minutes old
    const ts = parseInt(timestamp, 10)
    if (isNaN(ts)) return false
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - ts) > 300) return false

    // Decode the whsec_... secret (strip prefix, base64-decode)
    const secretBase64 = secret.startsWith('whsec_')
      ? secret.slice('whsec_'.length)
      : secret
    const secretBytes = Buffer.from(secretBase64, 'base64')

    // Compute HMAC-SHA256 over "{id}.{timestamp}.{rawBody}"
    const message = `${id}.${timestamp}.${rawBody}`
    const computed = createHmac('sha256', secretBytes)
      .update(message, 'utf8')
      .digest('base64')

    // The signature header may contain multiple comma-separated values (v1,<sig>)
    const candidates = signature.split(' ')
    for (const candidate of candidates) {
      const parts = candidate.split(',')
      // parts[0] = "v1", parts[1] = base64 sig
      if (parts.length < 2) continue
      const sigBase64 = parts.slice(1).join(',')
      try {
        const sigBytes = Buffer.from(sigBase64, 'base64')
        const computedBytes = Buffer.from(computed, 'base64')
        if (
          sigBytes.length === computedBytes.length &&
          timingSafeEqual(sigBytes, computedBytes)
        ) {
          return true
        }
      } catch {
        continue
      }
    }

    return false
  } catch {
    return false
  }
}

// Re-export for convenience so callers can avoid importing source-utils directly
export { isValidUSPhone, normalizeUSPhone }
