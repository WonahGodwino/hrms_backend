import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/certifications/drafts — Retrieve saved issuance draft state
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const draft = await prisma.trainingAuditLog.findFirst({
      where: {
        companyId,
        actorId: user.userId,
        entityType: 'certification_issuance_draft',
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

// POST /api/certifications/drafts — Save or update issuance draft
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const body = await req.json()
    const { draftState, step, employeeIds, certification } = body || {}

    const resolved = await resolveRequestCompanyId(user, body?.companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved

    const payloadToSave = draftState ?? { step, employeeIds, certification }

    // Upsert draft record in TrainingAuditLog
    const existingDraft = await prisma.trainingAuditLog.findFirst({
      where: {
        companyId: cid,
        actorId: user.userId,
        entityType: 'certification_issuance_draft',
      },
    })

    let savedRecord
    if (existingDraft) {
      savedRecord = await prisma.trainingAuditLog.update({
        where: { id: existingDraft.id },
        data: {
          metadata: payloadToSave,
          createdAt: new Date(),
        },
      })
    } else {
      savedRecord = await prisma.trainingAuditLog.create({
        data: {
          companyId: cid,
          actorId: user.userId,
          action: 'DRAFT_SAVED',
          entityType: 'certification_issuance_draft',
          entityId: `draft_${Date.now()}`,
          metadata: payloadToSave,
        },
      })
    }

    return withCors(
      ApiResponse.success(
        {
          draftId: savedRecord.id,
          savedState: payloadToSave,
          updatedAt: savedRecord.createdAt,
        },
        'Issuance draft saved successfully',
      ),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// DELETE /api/certifications/drafts — Discard saved issuance draft
export async function DELETE(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    await prisma.trainingAuditLog.deleteMany({
      where: {
        companyId,
        actorId: user.userId,
        entityType: 'certification_issuance_draft',
      },
    })

    return withCors(ApiResponse.success(null, 'Draft discarded successfully'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
