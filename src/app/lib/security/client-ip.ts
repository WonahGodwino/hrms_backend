// Client IP for rate limiting and audit logs (SEC-010).
//
// The left-most X-Forwarded-For entry is whatever the client chose to send, so
// keying a rate limit on it lets anyone bypass the limit by changing the header.
// Each proxy APPENDS the address it received the request from, so the entries
// added by our own proxies are on the right. With one proxy (nginx) in front of
// the app, the right-most entry is the real client address.
// Set TRUSTED_PROXY_HOPS to the number of proxies in front of the app if that
// changes (e.g. 2 for a CDN in front of nginx). Default 1.
type HeaderSource = { get(name: string): string | null }

export function getTrustedClientIp(headers: HeaderSource): string {
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS || '1', 10) || 1)
  const chain = (headers.get('x-forwarded-for') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (chain.length > 0) return chain[Math.max(0, chain.length - hops)]
  const realIp = headers.get('x-real-ip')?.trim()
  return realIp || '127.0.0.1'
}
