// POST/DELETE /api/admin/settings/offer-letter/signature
// Upload or remove the company's offer-letter signature image.
// Accepts multipart/form-data with a "file" field (PNG/JPEG/SVG, max 1 MB).
// DELETE removes the signature.
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

type AuthUser = { userId: string; role: string; companyId?: string }

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

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const MAX_SIZE = 1 * 1024 * 1024 // 1 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as AuthUser
    const requested = new URL(req.url).searchParams.get('companyId')
    const accessible = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessible, requested)

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('No file provided', 400), origin)
    if (!ALLOWED_TYPES.includes(file.type)) {
      return withCors(ApiResponse.error(`Unsupported file type: ${file.type}. Allowed: PNG, JPEG, SVG`, 400), origin)
    }
    if (file.size > MAX_SIZE) {
      return withCors(ApiResponse.error('Signature file must be under 1 MB', 400), origin)
    }

    // Read the file as a base64 data URI for storage in the DB.
    const bytes = Buffer.from(await file.arrayBuffer())
    const dataUri = `data:${file.type};base64,${bytes.toString('base64')}`

    await (prisma as any).company.update({
      where: { id: companyId },
      data: { signatureImage: dataUri },
    })

    return withCors(ApiResponse.success({ signatureImage: dataUri }, 'Signature uploaded'), origin)
  } catch (e) { return mapErr(e, origin) }
}

export async function DELETE(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']) as AuthUser
    const requested = new URL(req.url).searchParams.get('companyId')
    const accessible = await getAccessibleCompanyIds(user)
    const companyId = pickTargetCompanyId(user, accessible, requested)

    await (prisma as any).company.update({
      where: { id: companyId },
      data: { signatureImage: null },
    })

    return withCors(ApiResponse.success(null, 'Signature removed'), origin)
  } catch (e) { return mapErr(e, origin) }
}
