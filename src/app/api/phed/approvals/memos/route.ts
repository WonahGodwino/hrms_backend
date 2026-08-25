import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireModuleAccess } from '@/app/lib/module-access'
import { requirePhedApprovalAccess } from '@/app/lib/phed/access-role'
import { buildApprovalMemoSections } from '@/app/lib/phed/approval-memo-data'
import { PHED_APPROVAL_STAGES, getDisplayStatus } from '@/app/lib/phed/approval-stages'
import { notifyAfterForward } from '@/app/lib/phed/approval-notifications'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/approvals/memos — Memo Archive (Screen 4)
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedApprovalAccess(token)

    const p = new URL(req.url).searchParams
    const companyId = user.role === 'SUPER_ADMIN' ? (p.get('companyId') || user.companyId) : user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const page = Math.max(1, Number(p.get('page') || 1))
    const limit = Math.min(100, Math.max(1, Number(p.get('limit') || 50)))

    const [total, memos] = await Promise.all([
      prisma.phedApprovalMemo.count({ where: { companyId } }),
      prisma.phedApprovalMemo.findMany({
        where: { companyId },
        include: { payPeriod: { select: { id: true, periodName: true, month: true, year: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const rows = await Promise.all(
      memos.map(async memo => {
        const sections = await buildApprovalMemoSections(memo.payPeriodId)
        return {
          id: memo.id,
          payPeriod: memo.payPeriod,
          totalNetPay: sections.totalNetPay,
          currentStage: memo.currentStage,
          status: memo.status,
          displayStatus: getDisplayStatus(memo.status),
          dateFullyApproved: memo.status === 'APPROVED' ? memo.updatedAt : null,
        }
      }),
    )

    return withCors(ApiResponse.success({ memos: rows, total, page, limit, pages: Math.ceil(total / limit) }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/phed/approvals/memos — Stage 1: Submit for Approval
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    // Stage 1 is performed by the HR/ADMIN/SUPER_ADMIN who uploaded the payroll
    // for this pay period — acting as Manager, Compensation & Benefits — not by
    // an externally assigned role holder.
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { payPeriodId, comment } = body || {}
    if (!payPeriodId) return withCors(ApiResponse.error('payPeriodId is required', 400), origin)

    const companyId = user.role === 'SUPER_ADMIN' ? (body.companyId || user.companyId) : user.companyId
    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    const period = await prisma.phedPayPeriod.findUnique({ where: { id: payPeriodId } })
    if (!period || period.companyId !== companyId) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (period.status !== 'REVIEW') {
      return withCors(ApiResponse.error('Only a pay period in REVIEW status can be submitted for approval', 400), origin)
    }

    // A memo already exists for this period: only a flagged-and-returned one
    // (status RETURNED_FOR_CORRECTION) may be resubmitted — it reuses the same
    // record per PRD 12.8 rather than creating a duplicate. Anything else
    // (already in progress, or already APPROVED) is a conflict.
    const existing = await prisma.phedApprovalMemo.findUnique({ where: { payPeriodId } })
    if (existing && existing.status !== 'RETURNED_FOR_CORRECTION') {
      return withCors(ApiResponse.error('An approval memo already exists for this pay period', 409), origin)
    }

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    const stage1 = PHED_APPROVAL_STAGES[0]
    const actorName = staff ? `${staff.firstName} ${staff.lastName}` : 'Unknown'

    const memo = await prisma.$transaction(async tx => {
      const record = existing
        ? await tx.phedApprovalMemo.update({
            where: { id: existing.id },
            data: { currentStage: 2, status: stage1.resultStatus, stageEnteredAt: new Date() },
          })
        : await tx.phedApprovalMemo.create({
            data: {
              companyId,
              payPeriodId,
              currentStage: 2,
              status: stage1.resultStatus,
              attemptNumber: 1,
              stageEnteredAt: new Date(),
            },
          })

      await tx.phedApprovalStamp.create({
        data: {
          memoId: record.id,
          attemptNumber: record.attemptNumber,
          stage: 1,
          action: stage1.action,
          staffRecordId: user.userId,
          actorName,
          actorRole: stage1.role,
          comment: comment || null,
        },
      })
      return record
    })

    notifyAfterForward(memo, actorName).catch(err => console.error('PHED approval notification failed:', err))

    return withCors(ApiResponse.success(memo, 'Approval memo created and sent to Tax Audit', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
