// POST /api/auth/sso/:provider  (provider = 'google' | 'microsoft')
//
// Staff single sign-on: the frontend obtains an OIDC id_token from the browser's
// already-authenticated identity provider (Google Identity Services button /
// MSAL.js) and exchanges it here for a normal 247HR session JWT — no password.
// If the browser isn't signed into the provider, the provider SDK prompts the
// user to authenticate their email first.
//
// Requires GOOGLE_CLIENT_ID (and/or MICROSOFT_CLIENT_ID / MICROSOFT_TENANT).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { verifyGoogleIdToken, verifyMicrosoftIdToken } from '@/app/lib/auth/sso'
import { issueSession } from '@/app/lib/auth/session'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'auth')
  if (rl) return withCors(rl, origin)

  try {
    const { provider } = await params
    const body = await req.json().catch(() => ({}))
    const idToken = typeof body?.idToken === 'string' ? body.idToken : ''
    const companyId = body?.companyId ? String(body.companyId) : null
    const dropDeviceId = body?.dropDeviceId ? String(body.dropDeviceId) : null

    if (!idToken) {
      return withCors(ApiResponse.error('Missing identity token', 400), origin)
    }

    const email =
      provider === 'microsoft'
        ? await verifyMicrosoftIdToken(idToken)
        : await verifyGoogleIdToken(idToken)

    if (!email) {
      return withCors(
        ApiResponse.error('Could not verify your identity with this provider. Please try again.', 401),
        origin
      )
    }

    const candidates = companyId
      ? await forCompany(companyId).staffRecord.findMany({
          where: { email, isActive: true },
          include: { designation: { select: { id: true, title: true, code: true } } },
        })
      : await prisma.staffRecord.findMany({
          where: { email, isActive: true },
          include: { designation: { select: { id: true, title: true, code: true } } },
        })

    if (candidates.length === 0) {
      return withCors(
        ApiResponse.error('No account found for this email. Please contact your HR administrator.', 401),
        origin
      )
    }

    // Same email across multiple companies → the frontend presents a picker and
    // retries with the chosen companyId.
    if (candidates.length > 1 && !companyId) {
      const companyIds = [...new Set(candidates.map((c) => c.companyId))]
      const companies = await prisma.company.findMany({
        where: { id: { in: companyIds }, archived: 0 },
        select: { id: true, companyName: true },
      })
      return withCors(
        ApiResponse.error(
          'Your email is associated with multiple companies. Select one to continue.',
          409,
          [],
          { code: 'SELECT_COMPANY', companies: companies.map((c) => ({ companyId: c.id, companyName: c.companyName })) }
        ),
        origin
      )
    }

    const staff = candidates[0]

    if (staff.isBlocked) {
      await logStaffActivity({
        staffRecordId: staff.id,
        companyId: staff.companyId,
        action: 'LOGIN_BLOCKED_ATTEMPT',
        performedById: staff.id,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: staff.role,
      })
      return withCors(
        ApiResponse.error(
          'Your access has been restricted. Please contact your HR administrator.',
          403,
          [],
          { code: 'ACCOUNT_BLOCKED' }
        ),
        origin
      )
    }

    if (staff.role === 'STAFF' && !staff.isRegistered) {
      return withCors(ApiResponse.error('Complete registration before login', 403), origin)
    }

    const session = await issueSession(staff, req, {
      dropDeviceId,
      activityAction: 'SSO_LOGIN_SUCCESS',
    })

    if (!session.ok) {
      const extra = session.code
        ? { code: session.code, ...(session.devices ? { devices: session.devices } : {}) }
        : undefined
      return withCors(ApiResponse.error(session.message, session.status, [], extra), origin)
    }

    return withCors(
      ApiResponse.success(
        {
          token: session.token,
          refreshToken: session.refreshToken,
          user: session.user,
          company: session.company,
          enabledModules: session.enabledModules,
          archivedModules: session.archivedModules,
        },
        provider === 'microsoft' ? 'Signed in with Microsoft' : 'Signed in with Google'
      ),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
