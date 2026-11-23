import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/[id]/renewal/draft
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const draft = await forCompany(user.companyId!).trainingAuditLog.findFirst({
      where: {
        actorId: user.userId,
        entityType: 'certification_renewal_draft',
        entityId: params.id,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!draft) {
      return withCors(ApiResponse.success({ draft: null, hasDraft: false }), origin)
    }

    return withCors(
      ApiResponse.success({
        draftId: draft.id,
        savedState: draft.metadata,
        updatedAt: draft.createdAt,
        hasDraft: true,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/certifications/[id]/renewal/draft
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const body = await req.json().catch(() => ({}))

    const existingDraft = await forCompany(user.companyId!).trainingAuditLog.findFirst({
      where: {
        actorId: user.userId,
        entityType: 'certification_renewal_draft',
        entityId: params.id,
      },
    })

    let savedRecord
    if (existingDraft) {
      savedRecord = await prisma.trainingAuditLog.update({
        where: { id: existingDraft.id },
        data: {
          metadata: body,
          createdAt: new Date(),
        },
      })
    } else {
      savedRecord = await prisma.trainingAuditLog.create({
        data: {
          companyId: user.companyId!,
          actorId: user.userId,
          action: 'DRAFT_SAVED',
          entityType: 'certification_renewal_draft',
          entityId: params.id,
          metadata: body,
        },
      })
    }

    return withCors(
      ApiResponse.success(
        {
          draftId: savedRecord.id,
          savedState: body,
          updatedAt: savedRecord.createdAt,
        },
        'Renewal draft saved successfully',
      ),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// DELETE /api/certifications/[id]/renewal/draft
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    await forCompany(user.companyId!).trainingAuditLog.deleteMany({
      where: {
        actorId: user.userId,
        entityType: 'certification_renewal_draft',
        entityId: params.id,
      },
    })

    return withCors(ApiResponse.success(null, 'Renewal draft discarded successfully'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
