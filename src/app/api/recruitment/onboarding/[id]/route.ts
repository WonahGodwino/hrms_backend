// PATCH /api/recruitment/onboarding/:id
// Updates a hire's handoff details (expected start date, job title, department,
// assigned line manager). Start date persists on the onboarding row; the job
// title / department / manager are stored as an overrides blob on the offer's
// metadata (no schema change). When the hire has already been promoted to a
// StaffRecord, the chosen manager is also written to StaffRecord.managerId so
// the reporting line is live immediately.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

function parseDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null
  const d = new Date(String(raw))
  return isNaN(d.getTime()) ? null : d
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const onboarding = await prisma.onboarding.findFirst({
      where: { id, companyId },
      include: { offer: { select: { id: true, metadata: true } } },
    })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)

    const body = await request.json().catch(() => ({}))
    const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : undefined
    const department = typeof body.department === 'string' ? body.department.trim() : undefined
    const managerId = typeof body.managerId === 'string' ? body.managerId.trim() : undefined
    const managerName = typeof body.managerName === 'string' ? body.managerName.trim() : undefined
    const startDate = 'startDate' in body ? parseDate(body.startDate) : undefined

    // If a manager id was supplied, ensure it points to a real staff record in this company.
    if (managerId) {
      const mgr = await prisma.staffRecord.findFirst({ where: { id: managerId, companyId }, select: { id: true } })
      if (!mgr) return withCors(ApiResponse.error('Selected manager was not found for this company', 400), origin)
    }

    // 1) Persist start date on the onboarding row (real column).
    if (startDate !== undefined) {
      await prisma.onboarding.update({
        where: { id },
        data: { startDate: startDate ?? null, updatedBy: actor },
      })
    }

    // 2) Merge the handoff overrides into the offer metadata blob.
    if (onboarding.offer && (jobTitle !== undefined || department !== undefined || managerId !== undefined || managerName !== undefined)) {
      const existingMeta = (onboarding.offer.metadata && typeof onboarding.offer.metadata === 'object')
        ? onboarding.offer.metadata as Record<string, any> : {}
      const existingHandoff = (existingMeta.handoff && typeof existingMeta.handoff === 'object')
        ? existingMeta.handoff as Record<string, any> : {}
      const handoff = {
        ...existingHandoff,
        ...(jobTitle !== undefined ? { jobTitle } : {}),
        ...(department !== undefined ? { department } : {}),
        ...(managerId !== undefined ? { managerId } : {}),
        ...(managerName !== undefined ? { managerName } : {}),
      }
      await prisma.offer.update({
        where: { id: onboarding.offer.id },
        data: { metadata: { ...existingMeta, handoff } as any, updatedBy: actor },
      })
    }

    // 3) If already promoted to staff, make the reporting line live right away.
    if (managerId && onboarding.staffRecordId) {
      await prisma.staffRecord.update({
        where: { id: onboarding.staffRecordId },
        data: { managerId },
      }).catch(() => {})
    }

    return withCors(ApiResponse.success({
      id,
      startDate: startDate !== undefined ? (startDate ? startDate.toISOString() : null) : (onboarding.startDate?.toISOString() ?? null),
      jobTitle: jobTitle ?? null,
      department: department ?? null,
      managerId: managerId ?? null,
      managerName: managerName ?? null,
    }, 'Handoff details updated.'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
