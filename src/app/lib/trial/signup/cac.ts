// Registration (RC) number verification for self sign-up.
//
// Two layers:
//  1. In-app plausibility checks (always on, free): malformed, sequential or repeating numbers
//     and placeholder company names are rejected before any paid lookup is made.
//  2. Dojah "CAC basic" lookup (when keys exist): the RC must exist, be active and its registered
//     name must match the company name given.
// Without Dojah keys, a number that passes layer 1 is recorded as "self-declared" so a Super_Admin
// can confirm it on https://search.cac.gov.ng from the review console.
//
// Env: DOJAH_APP_ID, DOJAH_SECRET_KEY, DOJAH_BASE_URL (default https://api.dojah.io; the docs also
// mention https://sandbox.dojah.io for sandbox - confirm in the Dojah dashboard),
// CAC_VERIFY_MODE = live | internal (default: live when keys are set, otherwise internal).
// The caller is never told which rule fired.
import { isValidRcFormat, normalizeCompanyName, normalizeRcNumber, similarity } from './normalize'

export const RC_NAME_MATCH_THRESHOLD = 0.8
const TIMEOUT_MS = 8000
const ACTIVE_STATUS = /^(active|registered|live)$/i

export interface CacRecord {
  name: string
  status: string
  type: string
}

export type CacLookup =
  | { kind: 'found'; record: CacRecord }
  | { kind: 'not_found' }
  | { kind: 'error'; reason: string }

export type RcVerdict =
  | { verdict: 'verified'; registeredName: string; status: string }
  | { verdict: 'self_declared' }
  | { verdict: 'rejected'; reason: 'bad_format' | 'implausible_number' | 'placeholder_name' | 'not_found' | 'inactive' | 'name_mismatch' }
  | { verdict: 'unavailable'; reason: string }

// ── Layer 1: in-app plausibility ─────────────────────────────────────────────

function isSequential(d: string): boolean {
  let up = true
  let down = true
  for (let i = 1; i < d.length; i++) {
    if (+d[i] !== (+d[i - 1] + 1) % 10) up = false
    if (+d[i] !== (+d[i - 1] + 9) % 10) down = false
  }
  return up || down
}

function isRepeating(d: string): boolean {
  if (/^(\d)\1+$/.test(d)) return true
  // 121212, 123123, 12341234
  for (let size = 1; size <= d.length / 2; size++) {
    if (d.length % size === 0 && d.slice(0, size).repeat(d.length / size) === d) return true
  }
  return false
}

const PLACEHOLDER_NAMES = /^(test|testing|demo|sample|dummy|fake|company|my company|abc|xyz|asdf|qwerty|none|na|n a|nil)(\s|$)/i

export function checkRcNumber(rcNumber: string, companyName: string): Extract<RcVerdict, { verdict: 'self_declared' | 'rejected' }> {
  const rc = normalizeRcNumber(rcNumber)
  if (!isValidRcFormat(rc)) return { verdict: 'rejected', reason: 'bad_format' }
  if (isSequential(rc) || isRepeating(rc) || /^0+/.test(rc)) return { verdict: 'rejected', reason: 'implausible_number' }
  const name = String(companyName || '').trim()
  if (name.replace(/[^A-Za-z]/g, '').length < 3 || PLACEHOLDER_NAMES.test(name)) {
    return { verdict: 'rejected', reason: 'placeholder_name' }
  }
  return { verdict: 'self_declared' }
}

// ── Layer 2: Dojah CAC lookup ────────────────────────────────────────────────

function liveEnabled(): boolean {
  const m = (process.env.CAC_VERIFY_MODE || '').toLowerCase()
  if (m === 'internal') return false
  return !!(process.env.DOJAH_APP_ID && process.env.DOJAH_SECRET_KEY)
}

const cache = new Map<string, { at: number; value: CacLookup }>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export async function lookupCompany(rcNumber: string): Promise<CacLookup> {
  const rc = normalizeRcNumber(rcNumber)
  const hit = cache.get(rc)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const appId = process.env.DOJAH_APP_ID
  const secret = process.env.DOJAH_SECRET_KEY
  if (!appId || !secret) return { kind: 'error', reason: 'cac_not_configured' }

  const base = (process.env.DOJAH_BASE_URL || 'https://api.dojah.io').replace(/\/$/, '')
  const url = `${base}/api/v1/kyc/cac/basic?rc_number=${encodeURIComponent(rc)}&company_type=COMPANY`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { Authorization: secret, AppId: appId }, signal: ctl.signal })
    let value: CacLookup
    if (res.status === 404) {
      value = { kind: 'not_found' }
    } else if (!res.ok) {
      // 401/402/429/5xx: our integration or the provider is the problem, not the person.
      return { kind: 'error', reason: `cac_http_${res.status}` }
    } else {
      const body: any = await res.json().catch(() => null)
      const e = body?.entity
      value = e?.company_name
        ? { kind: 'found', record: { name: String(e.company_name), status: String(e.status ?? ''), type: String(e.type_of_company ?? '') } }
        : { kind: 'not_found' }
    }
    cache.set(rc, { at: Date.now(), value })
    return value
  } catch (err: any) {
    return { kind: 'error', reason: err?.name === 'AbortError' ? 'cac_timeout' : 'cac_network' }
  } finally {
    clearTimeout(timer)
  }
}

// Pure decision on a lookup result, kept apart so it is easy to test.
export function judgeRc(lookup: CacLookup, submittedCompanyName: string): RcVerdict {
  if (lookup.kind === 'error') return { verdict: 'unavailable', reason: lookup.reason }
  if (lookup.kind === 'not_found') return { verdict: 'rejected', reason: 'not_found' }
  if (!ACTIVE_STATUS.test(lookup.record.status.trim())) return { verdict: 'rejected', reason: 'inactive' }
  const wanted = normalizeCompanyName(submittedCompanyName)
  if (!wanted || similarity(lookup.record.name, submittedCompanyName) < RC_NAME_MATCH_THRESHOLD) {
    return { verdict: 'rejected', reason: 'name_mismatch' }
  }
  return { verdict: 'verified', registeredName: lookup.record.name, status: lookup.record.status }
}

export async function verifyRc(rcNumber: string, companyName: string): Promise<RcVerdict> {
  const local = checkRcNumber(rcNumber, companyName)
  if (local.verdict === 'rejected') return local
  if (!liveEnabled()) return local
  return judgeRc(await lookupCompany(rcNumber), companyName)
}
