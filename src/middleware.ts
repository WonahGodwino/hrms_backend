import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { trialInternalKey } from '@/app/lib/trial/internal-key'
import { REQUEST_ID_HEADER, resolveRequestId } from '@/app/lib/observability/request-id'

// SEC-013: verify with jose, which checks the signature, the HS256 algorithm
// and the expiry. The previous hand-written verifier ignored both `alg` and `exp`.
async function verifyJwt(token: string, secret: string): Promise<{ payload: Record<string, unknown> }> {
  if (!secret) throw new Error('JWT secret not configured')
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
  return { payload: payload as Record<string, unknown> }
}
import { getCorsHeaders, handleCorsOptions } from '@/app/lib/cors'
import { fetchWithTimeout, TIMEOUTS } from '@/app/lib/http/fetch-with-timeout'

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
  // Performance and Appraisal
  '/api/appraisal-cycles':        'PERFORMANCE_APPRAISAL',
  '/api/appraisal-history':       'PERFORMANCE_APPRAISAL',
  '/api/review-templates':        'PERFORMANCE_APPRAISAL',
  '/api/question-bank':           'PERFORMANCE_APPRAISAL',
  '/api/competencies':            'PERFORMANCE_APPRAISAL',
  '/api/proficiency-scales':      'PERFORMANCE_APPRAISAL',
  '/api/goals':                   'PERFORMANCE_APPRAISAL',
  '/api/self-appraisals':         'PERFORMANCE_APPRAISAL',
  '/api/team-reviews':            'PERFORMANCE_APPRAISAL',
  '/api/team-goals':              'PERFORMANCE_APPRAISAL',
  '/api/calibration':             'PERFORMANCE_APPRAISAL',
  '/api/development-plans':       'PERFORMANCE_APPRAISAL',
  '/api/comparison':              'PERFORMANCE_APPRAISAL',
  '/api/pips':                    'PERFORMANCE_APPRAISAL',
  '/api/my-pip':                  'PERFORMANCE_APPRAISAL',
  '/api/my-performance':          'PERFORMANCE_APPRAISAL',
  '/api/promotions':              'PERFORMANCE_APPRAISAL',
  '/api/succession-dashboard':    'PERFORMANCE_APPRAISAL',
  '/api/performance-operations':   'PERFORMANCE_APPRAISAL',
  '/api/performance-intelligence':'PERFORMANCE_APPRAISAL',
  '/api/performance-actions':     'PERFORMANCE_APPRAISAL',
  '/api/fraud-bias':              'PERFORMANCE_APPRAISAL',
  '/api/audit-compliance':        'PERFORMANCE_APPRAISAL',
  '/api/feedback':                'PERFORMANCE_APPRAISAL',
  '/api/recognitions':            'PERFORMANCE_APPRAISAL',
  // Core Setup intelligence. The cron route (x-cron-secret, no JWT) is deliberately not mapped.
  '/api/core-setup/action-items':        'CORE_SETUP',
  '/api/core-setup/activity-log':        'CORE_SETUP',
  '/api/core-setup/automation/settings': 'CORE_SETUP',
  '/api/core-setup/automation/rules':    'CORE_SETUP',
  '/api/core-setup/automation/runs':     'CORE_SETUP',
  // Uncomment when these modules get backend routes:
  // '/api/tasks':                 'TASK_MANAGEMENT',
  // '/api/offboarding':           'OFFBOARDING',
}

// Paths that are always public regardless of prefix match.
const PUBLIC_PATHS = [
  '/api/recruitment/jobs/public',
  '/api/recruitment/offers/public',
  '/api/recruitment/onboarding/public',
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


// ── Free-trial read-only guard ───────────────────────────────────────────────
// Once a trial ends (or while it is held for review) every write is refused.
// The edge cannot query the database, so it asks /api/trial/status and caches the
// answer briefly. Fails open: if the lookup errors, the request goes through and
// the route-level limits still apply.
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']
const TRIAL_WRITE_ALLOWLIST = [
  '/api/auth/',
  '/api/trial/',
  '/api/notifications',
  '/api/super-admin/',
  '/api/admin/switch_company',
  '/api/core-setup/automation/cron',
]
const trialCache = new Map<string, { readOnly: boolean; restricted: boolean; at: number }>()
const TRIAL_CACHE_MS = 30_000

// Exports and document downloads are off for the whole trial (GET requests).
const EXPORT_PATH = /\/(export|download)(\/|$)/
const EXPORT_ALLOWED = ['/template', '/download-failed', '/api/payslips/', '/api/profile', '/status', '/history']

async function trialStateFor(req: NextRequest, companyId: string): Promise<{ readOnly: boolean; restricted: boolean }> {
  const hit = trialCache.get(companyId)
  if (hit && Date.now() - hit.at < TRIAL_CACHE_MS) return hit
  try {
    // SEC-013: never send JWT_SECRET itself; send a derived key that only
    // unlocks this lookup. INTERNAL_API_ORIGIN, when set, pins the target so it
    // never depends on request headers.
    const internalKey = await trialInternalKey()
    if (!internalKey) return { readOnly: false, restricted: false }
    const base = process.env.INTERNAL_API_ORIGIN || req.nextUrl.origin
    const res = await fetchWithTimeout(`${base}/api/trial/status?companyId=${encodeURIComponent(companyId)}`, {
      headers: { 'x-trial-internal': internalKey },
    }, TIMEOUTS.lookup)
    if (!res.ok) return { readOnly: false, restricted: false }
    const body = await res.json()
    const state = { readOnly: !!body?.data?.readOnly, restricted: !!body?.data?.restricted }
    trialCache.set(companyId, { ...state, at: Date.now() })
    return state
  } catch {
    return { readOnly: false, restricted: false }
  }
}

// Returns an error body when the request must be refused for a trial company.
async function trialBlock(req: NextRequest, pathname: string): Promise<{ message: string; code: string } | null> {
  const isWrite = WRITE_METHODS.includes(req.method)
  const isExport = req.method === 'GET' && EXPORT_PATH.test(pathname) && !EXPORT_ALLOWED.some(p => pathname.includes(p))
  if (!isWrite && !isExport) return null
  if (req.headers.get('x-cron-secret')) return null
  if (isWrite && TRIAL_WRITE_ALLOWLIST.some(p => pathname.startsWith(p))) return null
  const rawToken = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!rawToken) return null
  try {
    const { payload } = await verifyJwt(rawToken, process.env.JWT_SECRET ?? '')
    if (payload.role === 'SUPER_ADMIN' || !payload.companyId) return null
    const state = await trialStateFor(req, String(payload.companyId))
    if (isExport && state.restricted) {
      return { message: 'Exports and downloads are not included in the trial. You can review everything on screen.', code: 'TRIAL_EXPORT_DISABLED' }
    }
    if (isWrite && state.restricted && state.readOnly) {
      return { message: 'Your trial has ended and the account is read only. Subscribe to continue.', code: 'TRIAL_READ_ONLY' }
    }
    return null
  } catch {
    return null
  }
}

// REL-002: every /api request gets a correlation id. The route handler sees it
// as the x-request-id request header and every response (errors and CORS
// preflight included) returns it, so a user-reported failure can be matched to
// the server log line.
export async function middleware(req: NextRequest) {
  const requestId = resolveRequestId(req.headers.get(REQUEST_ID_HEADER))
  const response = await handle(req, requestId)
  response.headers.set(REQUEST_ID_HEADER, requestId)
  return response
}

async function handle(req: NextRequest, requestId: string): Promise<Response> {
  const { pathname } = req.nextUrl
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return handleCorsOptions(req)

  const blocked = await trialBlock(req, pathname)
  if (blocked) {
    return new NextResponse(
      JSON.stringify({ success: false, message: blocked.message, trialCode: blocked.code }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) } },
    )
  }

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

  const forwarded = new Headers(req.headers)
  forwarded.set(REQUEST_ID_HEADER, requestId)
  const response = NextResponse.next({ request: { headers: forwarded } })
  const corsHeaders = getCorsHeaders(origin)
  Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v))
  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
