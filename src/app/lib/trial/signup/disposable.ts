// Disposable / throwaway email detection for self sign-up. Runs at the form,
// before any code is sent. The built-in list covers the common generators; add
// more at runtime with TRIAL_EXTRA_DISPOSABLE_DOMAINS (comma separated) so new
// generators can be blocked without a release.
import { promises as dns } from 'dns'

const BUILT_IN = [
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net',
  '20minutemail.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tempail.com',
  'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'trashmail.de', 'yopmail.com', 'yopmail.net',
  'yopmail.fr', 'getnada.com', 'nada.email', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com',
  'mailnesia.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'burnermail.io', 'mytemp.email',
  'moakt.com', 'tmpmail.org', 'tmpmail.net', 'discard.email', 'discardmail.com', 'spamgourmet.com',
  'mailcatch.com', 'inboxkitten.com', 'getairmail.com', 'anonaddy.me', 'harakirimail.com', 'mailforspam.com',
  'tempinbox.com', 'emailfake.com', 'fakemail.net', 'jetable.org', 'luxusmail.org', 'mail-temp.com',
  'minuteinbox.com', 'owlymail.com', 'spambox.us', 'tempr.email', 'trbvm.com', 'yomail.info', 'zetmail.com',
]

const blocked = new Set<string>(BUILT_IN)
for (const d of (process.env.TRIAL_EXTRA_DISPOSABLE_DOMAINS || '').split(',')) {
  const t = d.trim().toLowerCase()
  if (t) blocked.add(t)
}

export function emailDomain(email: string): string {
  return String(email || '').trim().toLowerCase().split('@')[1] || ''
}

// True for a listed domain or any subdomain of one (a.b.mailinator.com).
export function isDisposableDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase()
  if (!d) return false
  const parts = d.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    if (blocked.has(parts.slice(i).join('.'))) return true
  }
  return false
}

export function isDisposableEmail(email: string): boolean {
  return isDisposableDomain(emailDomain(email))
}

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com'])

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL.has(domain.trim().toLowerCase())
}

// A domain that can receive mail has MX (or at least A) records. Lookup errors
// other than "not found" (timeouts, resolver down) count as "can receive" so a
// DNS hiccup never blocks a genuine sign-up.
export async function domainCanReceiveMail(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain)
    if (mx.length > 0) return true
  } catch (err: any) {
    if (err?.code !== 'ENODATA' && err?.code !== 'ENOTFOUND') return true
  }
  try {
    const a = await dns.resolve4(domain)
    return a.length > 0
  } catch (err: any) {
    return !(err?.code === 'ENODATA' || err?.code === 'ENOTFOUND')
  }
}
