// Normalisation + hashing for identity signals. Raw values are never stored in
// TrialSignal: only the keyed hash, so a leak of the table reveals nothing.
import crypto from 'crypto'

export type SignalKind = 'EMAIL_DOMAIN' | 'PHONE' | 'RC_NUMBER' | 'TAX_ID' | 'DEVICE' | 'IP' | 'COMPANY_NAME'

const SUFFIXES = /\b(limited|ltd|plc|inc|incorporated|llc|nigeria|nig|enterprises|enterprise|ventures|group|company|co)\b/g

// "Acme Ltd." and "ACME Limited" normalise to the same string.
export function normalizeCompanyName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Nigerian numbers to +234XXXXXXXXXX so 0803..., 234803... and +234 803... match.
export function normalizePhone(phone: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.startsWith('234') && digits.length >= 13) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`
  if (digits.length === 10) return `+234${digits}`
  return `+${digits}`
}

export function normalizeRcNumber(rc: string): string {
  return String(rc || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(RC|BN|IT)/, '')
}

export function normalizeTaxId(tin: string): string {
  return String(tin || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function secret(): string {
  return process.env.TRIAL_SIGNAL_SECRET || process.env.JWT_SECRET || 'dev-trial-signal-secret'
}

export function hashSignal(kind: SignalKind, value: string): string {
  return crypto.createHmac('sha256', secret()).update(`${kind}:${value}`).digest('hex')
}

// Dice coefficient on character bigrams, 0..1. Cheap and good for near-matches.
export function similarity(a: string, b: string): number {
  const x = normalizeCompanyName(a)
  const y = normalizeCompanyName(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return 0
  const bigrams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) || 0) + 1)
    }
    return m
  }
  const bx = bigrams(x)
  const by = bigrams(y)
  let overlap = 0
  for (const [g, n] of bx) overlap += Math.min(n, by.get(g) || 0)
  return (2 * overlap) / (x.length - 1 + (y.length - 1))
}
