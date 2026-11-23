// Key for the middleware's internal trial-status lookup (SEC-013).
//
// The middleware used to send JWT_SECRET itself in a header, to an address
// derived from the incoming request. It now sends this value instead: an HMAC
// of a fixed label under JWT_SECRET. It only unlocks the trial-status lookup,
// so even if it were ever sent to the wrong host it reveals nothing that could
// sign tokens. Works in both the edge (middleware) and Node (route) runtimes.
const LABEL = 'trial-status-internal-v1'

export async function trialInternalKey(): Promise<string | null> {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(LABEL))
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison of the presented key with the expected one. */
export async function isTrialInternalKey(presented: string | null): Promise<boolean> {
  const expected = await trialInternalKey()
  if (!presented || !expected || presented.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
