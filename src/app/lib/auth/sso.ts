// OIDC ID-token verification for staff single sign-on.
//
// Staff whose official email is already authenticated in the same browser
// (Google Workspace / Microsoft Entra) can sign in without a password. The
// frontend obtains a provider ID token (Google Identity Services button /
// MSAL.js) and POSTs it to /api/auth/sso/:provider; this module verifies the
// token's signature against the provider's public keys and returns the verified
// email. Zero extra runtime dependencies — verification uses jsonwebtoken +
// Node crypto against the provider JWKS endpoint.
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { fetchWithTimeout, TIMEOUTS } from '@/app/lib/http/fetch-with-timeout'

// Convert an RSA JWK (n, e) into an SPKI PEM public key for RS256 verification.
function pemFromJwk(n: string, e: string): string {
  const key = crypto.createPublicKey({
    key: { kty: 'RSA', n, e },
    format: 'jwk',
  })
  return key.export({ type: 'spki', format: 'pem' }).toString()
}

async function fetchJwks(uri: string): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(uri, { cache: 'no-store' }, TIMEOUTS.lookup)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

type VerifyOptions = {
  token: string
  audience: string
  jwksUri: string
  issuer?: string | string[]
  // Loose issuer check for multi-tenant IdPs whose issuer embeds a tenant id.
  issuerPattern?: RegExp
  requireEmailVerified?: boolean
}

async function verifyOidcIdToken(opts: VerifyOptions): Promise<string | null> {
  try {
    const header = jwt.decode(opts.token, { complete: true })?.header as any
    if (!header || header.alg !== 'RS256' || !header.kid) return null

    const jwks = await fetchJwks(opts.jwksUri)
    const keys: any[] = jwks?.keys || []
    const jwk = keys.find((k: any) => k.kid === header.kid)
    if (!jwk || !jwk.n || !jwk.e) return null

    const publicKey = pemFromJwk(jwk.n, jwk.e)
    const verifyOptions: any = { algorithms: ['RS256'], audience: opts.audience }
    if (opts.issuer) verifyOptions.issuer = opts.issuer

    const decoded = jwt.verify(opts.token, publicKey, verifyOptions) as any

    if (opts.issuerPattern && !opts.issuerPattern.test(String(decoded.iss || ''))) return null
    if (opts.requireEmailVerified && decoded.email_verified !== true) return null

    const email = String(
      decoded.email || decoded.preferred_username || decoded.upn || ''
    )
      .trim()
      .toLowerCase()
    return email || null
  } catch {
    return null
  }
}

// Google: OIDC id_token from the GIS "Sign in with Google" button.
// Multi-tenant: a single client id accepts ANY Google account (Gmail or any
// Workspace organisation) as long as the OAuth consent screen is "External".
// Requires GOOGLE_CLIENT_ID in the environment.
export async function verifyGoogleIdToken(idToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return null
  return verifyOidcIdToken({
    token: idToken,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    requireEmailVerified: true,
  })
}

// Microsoft Entra ID: OIDC id_token from MSAL.js loginPopup/redirect.
//
// Multi-tenant: MICROSOFT_TENANT='common' (or 'organizations') accepts ANY
// Microsoft Entra organisation; a directory (tenant) GUID pins it to one org.
// The id_token issuer embeds the signing tenant's id, so it is validated with a
// pattern (not a fixed string) while signature + audience remain the hard checks.
export async function verifyMicrosoftIdToken(idToken: string): Promise<string | null> {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  if (!clientId) return null
  const tenant = process.env.MICROSOFT_TENANT || 'common'
  return verifyOidcIdToken({
    token: idToken,
    audience: clientId,
    jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
    issuerPattern: /^https:\/\/login\.microsoftonline\.com\/[^/]+(?:\/v2\.0)?$/,
  })
}
