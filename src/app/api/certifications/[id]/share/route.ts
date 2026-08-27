import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import crypto from 'crypto'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/[id]/share
// Generates a secure share link/token for verifying or viewing a certification record
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const record = await prisma.certificationRecord.findFirst({
      where: {
        id: params.id,
        companyId,
        ...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
      },
      include: {
        certificationType: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    })

    if (!record) {
      return withCors(ApiResponse.error('Certification record not found', 404), origin)
    }

    const shareToken = crypto.randomBytes(16).toString('hex')
    const expiresAt  = new Date(Date.now() + 30 * 86_400_000) // 30 days valid
    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('host') || 'http://localhost:3000'
    const protocol   = baseUrl.startsWith('http') ? '' : 'https://'
    const shareUrl   = `${protocol}${baseUrl}/public/verify-certification/${record.id}?token=${shareToken}`

    await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'SHARE_LINK_GENERATED',
        entityType: 'certification_record',
        entityId: params.id,
        metadata: { shareToken, expiresAt },
      },
    })

    return withCors(
      ApiResponse.success(
        {
          certificationId: record.id,
          shareToken,
          shareUrl,
          expiresAt: expiresAt.toISOString(),
          employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
          certificationName: record.certificationType.name,
        },
        'Share link generated successfully',
      ),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
