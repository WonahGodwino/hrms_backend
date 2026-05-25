import { NextRequest, NextResponse } from 'next/server'
// import { jwtVerify } from 'jose'

// JWT verification for Edge Runtime using Web Crypto API
async function verifyJwt(token: string, secret: string): Promise<any> {
  // Only supports HS256
  const [headerB64, payloadB64, signatureB64] = token.split('.')
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('Invalid JWT format')

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const data = encoder.encode(`${headerB64}.${payloadB64}`)
  const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

  const valid = await crypto.subtle.verify('HMAC', key, signature, data)
  if (!valid) throw new Error('Invalid signature')

  const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
  return { payload: JSON.parse(payloadJson) }
}
import { getCorsHeaders, handleCorsOptions } from '@/app/lib/cors'

// ── Module route map ──────────────────────────────────────────────────────────
// Maps URL path prefixes to module keys.
// When a module gets backend routes, add ONE entry here. Nothing else needed.
const MODULE_ROUTE_MAP: Record<string, string> = {
  '/api/phed':                    'PHED',
  '/api/recruitment':             'RECRUITMENT',
  '/api/training-programs':       'TRAINING',
  '/api/training-sessions':       'TRAINING',
  '/api/assessments':             'TRAINING',
  '/api/attempts':                'TRAINING',
  '/api/certifications':          'TRAINING',
  '/api/certification-templates': 'TRAINING',
  '/api/certification-types':     'TRAINING',
  '/api/assignment-rules':        'TRAINING',
  '/api/attendance':              'ATTENDANCE',
  '/api/leaves':                  'LEAVE',
  '/api/payroll':                 'PAYROLL',
  '/api/payslips':                'PAYROLL',
  '/api/profile':                 'PAYROLL',
  // Uncomment when these modules get backend routes:
  // '/api/core-setup':            'CORE_SETUP',
  // '/api/onboarding':            'ONBOARDING',
  // '/api/tasks':                 'TASK_MANAGEMENT',
  // '/api/offboarding':           'OFFBOARDING',
}

// Paths that are always public regardless of prefix match.
const PUBLIC_PATHS = [
  '/api/recruitment/jobs/public',
]

function resolveModuleKey(pathname: string): string | null {
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return null
  const match = Object.keys(MODULE_ROUTE_MAP).find(prefix => pathname.startsWith(prefix))
  return match ? MODULE_ROUTE_MAP[match] : null
}

function jsonError(message: string, status: number, origin: string | null) {
  return new NextResponse(JSON.stringify({ success: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  })
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return handleCorsOptions(req)

  const moduleKey = resolveModuleKey(pathname)

  if (moduleKey) {
    const rawToken = req.headers.get('authorization')?.replace('Bearer ', '') ?? null

    if (!rawToken) {
      return jsonError('Authentication required', 401, origin)
    }

    try {

      const secret = process.env.JWT_SECRET ?? ''
      const { payload } = await verifyJwt(rawToken, secret)

      // SUPER_ADMIN bypasses all module checks
      if (payload.role !== 'SUPER_ADMIN') {
        const enabled = payload.enabledModules as string[] | undefined

        // Only enforce when the token actually carries module data.
        // Tokens issued before this feature was deployed won't have the field —
        // those fall through to the route-level requireModuleAccess DB check.
        if (enabled !== undefined && !enabled.includes(moduleKey)) {
          return jsonError('This module is not available for your organisation', 403, origin)
        }
      }
    } catch {
      return jsonError('Invalid or expired token', 401, origin)
    }
  }

  const response = NextResponse.next()
  const corsHeaders = getCorsHeaders(origin)
  Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v))
  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
