// Email checks for self sign-up beyond the disposable-domain list: canonical form
// (so one mailbox cannot be used twice through aliases), test/fake/role addresses,
// reserved and look-alike (phishing) domains, and domain age.
// All pure except domainAgeDays, which fails open on any lookup problem.
import { emailDomain } from './disposable'

// ── Canonical form ───────────────────────────────────────────────────────────

const GMAIL = new Set(['gmail.com', 'googlemail.com'])

// a.b+x@googlemail.com -> ab@gmail.com. Other providers: lowercase and drop "+tag".
export function canonicalEmail(email: string): string {
  const e = String(email || '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1) return e
  let local = e.slice(0, at)
  let domain = e.slice(at + 1)
  local = local.split('+')[0]
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, '')
    domain = 'gmail.com'
  }
  return `${local}@${domain}`
}

// ── Reserved / test / role ───────────────────────────────────────────────────

const RESERVED_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'test.com', 'test.org', 'test.net', 'localhost', 'invalid', 'domain.com', 'email.com', 'mail.com.test'])
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost', 'local', 'internal', 'lan'])

export function isReservedDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase()
  if (!d) return false
  if (RESERVED_DOMAINS.has(d)) return true
  const tld = d.split('.').pop() as string
  return RESERVED_TLDS.has(tld)
}

const TEST_LOCALS = new Set([
  'test', 'tester', 'testing', 'test1', 'test2', 'test123', 'testuser', 'demo', 'fake', 'fakeemail', 'sample', 'dummy', 'temp', 'tmp',
  'asdf', 'asdfgh', 'asdfghjkl', 'qwerty', 'qwertyuiop', 'abc', 'abcd', 'abcde', 'abc123', 'xyz', 'xxx', 'aaa', 'foo', 'bar', 'foobar',
  'user', 'user1', 'username', 'name', 'email', 'mail', 'me', 'myemail', 'noone', 'nobody', 'null', 'none', 'na', 'hello', 'hi',
])
const ROLE_LOCALS = new Set([
  'admin', 'administrator', 'info', 'noreply', 'no-reply', 'donotreply', 'support', 'sales', 'contact', 'postmaster', 'webmaster',
  'hostmaster', 'abuse', 'root', 'office', 'hr', 'help', 'enquiries', 'inquiries', 'billing', 'accounts', 'mailer-daemon',
])

// Local part with digits stripped from the end, so "test77" and "demo2024" match "test"/"demo".
function stem(local: string): string {
  return local.replace(/[._-]/g, '').replace(/\d+$/, '')
}

export type EmailRisk = 'reserved_domain' | 'test_address' | 'role_address' | 'lookalike_domain' | null

export function testAddressReason(email: string): 'test_address' | 'role_address' | null {
  const local = String(email || '').trim().toLowerCase().split('@')[0].split('+')[0]
  if (!local) return null
  const st = stem(local)
  if (TEST_LOCALS.has(local) || TEST_LOCALS.has(st)) return 'test_address'
  if (/^(.)\1{2,}$/.test(st)) return 'test_address' // aaa, xxxx
  if (/^(test|demo|fake|dummy|sample)([._-][a-z]{0,8})?\d*$/.test(local)) return 'test_address'
  if (ROLE_LOCALS.has(local) || ROLE_LOCALS.has(st)) return 'role_address'
  return null
}

// ── Look-alike (phishing) domains ────────────────────────────────────────────

const WELL_KNOWN = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'live.com', 'aol.com', 'protonmail.com',
  'microsoft.com', 'google.com', 'paypal.com', '247hr.com',
]
const BRAND_TOKENS = ['247hr', 'paypal', 'microsoft', 'google', 'gmail']

// Edit distance where swapping two neighbouring letters (gmial) costs one.
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

export function isLookalikeDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase()
  if (!d) return false
  // Punycode / non-ASCII (homograph) domains are never a genuine company sign-up address.
  if (d.includes('xn--') || /[^\x00-\x7f]/.test(d)) return true
  if (WELL_KNOWN.includes(d)) return false
  // One typo away from a long, well-known provider (gmial.com, outlok.com). Short names like
  // live.com / aol.com are skipped: too many genuine domains sit one letter away.
  if (WELL_KNOWN.some((w) => w.length >= 9 && editDistance(d, w) <= 1)) return true
  // "gmail.com.co", "g-mail.com", "paypal-secure.net": brand token in a domain that is not the brand.
  const label = d.split('.')[0].replace(/-/g, '')
  return BRAND_TOKENS.some((t) => label.includes(t) && !WELL_KNOWN.includes(d))
}

export function hardEmailRisk(email: string, opts: { allowRole: boolean }): EmailRisk {
  const domain = emailDomain(email)
  if (isReservedDomain(domain)) return 'reserved_domain'
  if (isLookalikeDomain(domain)) return 'lookalike_domain'
  const t = testAddressReason(email)
  if (t === 'test_address') return 'test_address'
  if (t === 'role_address' && !opts.allowRole) return 'role_address'
  return null
}

// ── Domain age (RDAP) ────────────────────────────────────────────────────────

const ageCache = new Map<string, { at: number; days: number | null }>()
const AGE_TTL_MS = 12 * 60 * 60 * 1000

// Days since the domain was registered, or null when unknown (lookup failed, no
// RDAP for the TLD). Unknown never counts against the person.
export async function domainAgeDays(domain: string): Promise<number | null> {
  const d = domain.trim().toLowerCase()
  if (!d) return null
  const hit = ageCache.get(d)
  if (hit && Date.now() - hit.at < AGE_TTL_MS) return hit.days
  let days: number | null = null
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 3500)
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(d)}`, { signal: ctl.signal, headers: { accept: 'application/rdap+json' } })
    clearTimeout(timer)
    if (res.ok) {
      const body: any = await res.json()
      const reg = (body?.events || []).find((e: any) => e?.eventAction === 'registration')
      const t = reg?.eventDate ? Date.parse(reg.eventDate) : NaN
      if (!Number.isNaN(t)) days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
    }
  } catch {
    days = null
  }
  ageCache.set(d, { at: Date.now(), days })
  return days
}
