// GET/PUT/DELETE /api/admin/settings/offer-letter
// Reads/updates/deletes the company-level employer & legal details that populate the
// offer letter (seconded company, HR representative, governing law, etc.).
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

type AuthUser = { userId: string; role: string; companyId?: string }

const OFFER_FIELDS = [
  'secondedCompany', 'hrRepName', 'hrRepTitle',
  'communicationTool', 'governingLaw', 'arbitrationVenue',
  'signatoryName', 'signatoryPosition',
] as const

async function getAccessibleCompanyIds(user: AuthUser): Promise<string[]> {
  if (user.role === 'SUPER_ADMIN') {
    const companies = await prisma.company.findMany({ where: { archived: 0 }, select: { id: true } })
    return companies.map((c) => c.id)
  }
  const assignments = await prisma.userCompany.findMany({
    where: { userId: user.userId, company: { archived: 0 } },
    select: { companyId: true }, distinct: ['companyId'],
  })
  if (assignments.length > 0) return assignments.map((a) => a.companyId)
  if (!user.companyId) return []
  const fallback = await prisma.company.findFirst({ where: { id: user.companyId, archived: 0 }, select: { id: true } })
  return fallback ? [fallback.id] : []
}

function pickTargetCompanyId(user: AuthUser, accessible: string[], requested: string | null): string {
  if (requested) {
    if (!accessible.includes(requested)) throw new Error('Access denied to selected company')
    return requested
  }
  if (user.role === 'SUPER_ADMIN' && accessible.length > 1) throw new Error('companyId is required for SUPER_ADMIN when managing multiple companies')
  if (accessible.length === 0) throw new Error('No companies assigned to your account')
  return accessible[0]
}

function mapErr(error: any, origin: string | null) {
  if (error?.message === 'Access denied to selected company') return withCors(ApiResponse.error(error.message, 403), origin)
  if (error?.message === 'No companies assigned to your account') return withCors(ApiResponse.error(error.message, 403), origin)
  if (error?.message === 'companyId is required for SUPER_ADMIN when managing multiple companies') return withCors(ApiResponse.error(error.message, 400), origin)
  return withCors(handleApiError(error), origin)
}

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as AuthUser
    const requested = new URL(request.url).searchParams.get('companyId')
    const accessible = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessible, requested)

    const company = await (prisma as any).company.findUnique({
      where: { id: companyId },
      select: { id: true, companyName: true, rcNumber: true, offerResponseDays: true, updatedAt: true, ...Object.fromEntries(OFFER_FIELDS.map((f) => [f, true])) },
    })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    return withCors(ApiResponse.success(company, 'Offer letter settings fetched'), origin)
  } catch (error) { return mapErr(error, origin) }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as AuthUser
    const body = await request.json()
    const accessible = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessible, body?.companyId || null)

    // Only accept the known offer-letter fields; ignore anything else.
    const data: Record<string, any> = {}
    for (const f of OFFER_FIELDS) {
      if (body[f] !== undefined) data[f] = body[f] === '' ? null : String(body[f]).trim()
    }
    // Signature image — base64 data URI or URL
    if (body.signatureImage !== undefined) {
      data.signatureImage = body.signatureImage === '' || body.signatureImage === null ? null : String(body.signatureImage)
    }
    // Offer response window (days) — numeric, clamped to a sensible range.
    if (body.offerResponseDays !== undefined) {
      if (body.offerResponseDays === '' || body.offerResponseDays === null) {
        data.offerResponseDays = null
      } else {
        const n = Math.round(Number(body.offerResponseDays))
        if (!Number.isFinite(n) || n < 1 || n > 60) {
          return withCors(ApiResponse.error('offerResponseDays must be a whole number between 1 and 60', 400), origin)
        }
        data.offerResponseDays = n
      }
    }
    if (Object.keys(data).length === 0) return withCors(ApiResponse.error('No offer letter fields provided', 400), origin)

    const updated = await (prisma as any).company.update({
      where: { id: companyId },
      data,
      select: { id: true, companyName: true, rcNumber: true, offerResponseDays: true, updatedAt: true, ...Object.fromEntries(OFFER_FIELDS.map((f) => [f, true])) },
    })

    return withCors(ApiResponse.success(updated, 'Offer letter settings updated'), origin)
  } catch (error) { return mapErr(error, origin) }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as AuthUser
    const requested = new URL(request.url).searchParams.get('companyId')
    const accessible = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessible, requested)

    const cleared: Record<string, null> = {}
    for (const f of OFFER_FIELDS) cleared[f] = null
    cleared.signatureImage = null
    cleared.offerResponseDays = null

    await (prisma as any).company.update({
      where: { id: companyId },
      data: cleared,
    })

    return withCors(ApiResponse.success(null, 'Offer letter settings cleared'), origin)
  } catch (error) { return mapErr(error, origin) }
}
