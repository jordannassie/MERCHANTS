/**
 * Phone number normalization utilities.
 * Target format: +1XXXXXXXXXX (E.164 for US numbers)
 * Display format: (XXX) XXX-XXXX
 */

/** Strip everything except digits and leading + */
export function digitsOnly(raw: string): string {
  return raw.replace(/[^\d+]/g, '')
}

/**
 * Normalize a US phone number string to E.164 (+1XXXXXXXXXX).
 * Returns null if the number cannot be normalized to 10 meaningful digits.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1${digits.slice(1)}`
  }
  if (digits.length === 10) {
    // Reject obvious placeholders
    if (/^(0{10}|1{10}|5{10})$/.test(digits)) return null
    return `+1${digits}`
  }
  return null
}

/** Format a normalized E.164 number for display: (XXX) XXX-XXXX */
export function formatPhone(e164: string | null | undefined): string | null {
  if (!e164) return null
  const digits = e164.replace(/\D/g, '')
  const ten = digits.length === 11 ? digits.slice(1) : digits
  if (ten.length !== 10) return e164
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

/** tel: href from any phone string */
export function telHref(raw: string | null | undefined): string | null {
  const normalized = normalizePhone(raw)
  if (normalized) return `tel:${normalized}`
  if (raw) return `tel:${raw.replace(/\s/g, '')}`
  return null
}
