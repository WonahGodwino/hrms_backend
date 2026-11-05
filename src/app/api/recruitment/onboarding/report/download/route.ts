// GET /api/recruitment/onboarding/report/download — monthly onboarding
// summary workbook for the Onboarding Command Center's "Download Monthly
// Report" button.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { startOfBusinessMonth, endOfBusinessMonth } from '@/app/lib/attendance/business-day'
import { buildOnboardingReportWorkbook, type OnboardingReportRow, type OnboardingReportStage } from '@/app/lib/recruitment/onboarding-report'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const STAGE_LABEL: Record<string, OnboardingReportStage> = {
  NOT_STARTED: 'Pre-boarding',
  IN_PROGRESS: 'IT Provisioning',
  COMPLETED: 'Ready for Activation',
  CANCELLED: 'Cancelled',
}

const STATUS_PROGRESS: Record<string, number> = {
  NOT_STARTED: 10,
  IN_PROGRESS: 55,
  COMPLETED: 100,
  CANCELLED: 0,
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const now = new Date()
    const yearNum = parseInt(searchParams.get('year') ?? '', 10)
    const monthNum = parseInt(searchParams.get('month') ?? '', 10) // 1-indexed
    const anchor = Number.isFinite(yearNum) && Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12
      ? new Date(Date.UTC(yearNum, monthNum - 1, 15))
      : now

    const monthStart = startOfBusinessMonth(anchor)
    const monthEnd = endOfBusinessMonth(anchor)

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true } })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    const rows = await prisma.onboarding.findMany({
      where: { companyId, archived: 0, createdAt: { gte: monthStart, lte: monthEnd } },
      include: {
        application: {
          include: {
            candidate: { select: { firstName: true, lastName: true, email: true } },
            job: { select: { title: true, department: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const staffIds = rows.map((o) => o.staffRecordId).filter(Boolean) as string[]
    const REQUIRED_DOCS = ['MEANS_OF_ID', 'GUARANTOR_FORM', 'SIGNED_OFFER']
    const progressByStaff: Record<string, number> = {}
    if (staffIds.length) {
      const docs = await (prisma as any).staffOnboardingDocument.findMany({
        where: { staffId: { in: staffIds } },
        select: { staffId: true, category: true },
      })
      const byStaff: Record<string, Set<string>> = {}
      for (const d of docs) (byStaff[d.staffId] ||= new Set()).add(d.category)
      for (const sid of staffIds) {
        const have = byStaff[sid] || new Set()
        progressByStaff[sid] = Math.round((REQUIRED_DOCS.filter((c) => have.has(c)).length / REQUIRED_DOCS.length) * 100)
      }
    }

    // Blocking-issue signal: same convention as the list endpoint, open
    // (non-DONE) checklist tasks split into overdue/blocked vs. pending.
    const onboardingIds = rows.map((o) => o.id)
    const issuesByOnboarding: Record<string, { pendingCount: number; criticalCount: number }> = {}
    if (onboardingIds.length) {
      const nowTs = new Date()
      const openTasks = await prisma.onboardingTask.findMany({
        where: { onboardingId: { in: onboardingIds }, archived: 0, status: { not: 'DONE' } },
        select: { onboardingId: true, status: true, dueDate: true },
      })
      for (const t of openTasks) {
        const bucket = (issuesByOnboarding[t.onboardingId] ||= { pendingCount: 0, criticalCount: 0 })
        const isCritical = t.status === 'BLOCKED' || (!!t.dueDate && t.dueDate < nowTs)
        if (isCritical) bucket.criticalCount += 1
        else bucket.pendingCount += 1
      }
    }

    const reportRows: OnboardingReportRow[] = rows.map((o) => {
      const c = (o.application as any)?.candidate
      const onboardingMeta = (o.metadata && typeof o.metadata === 'object') ? (o.metadata as any) : {}
      const handoff = (onboardingMeta.handoff && typeof onboardingMeta.handoff === 'object') ? onboardingMeta.handoff : {}
      const issues = issuesByOnboarding[o.id]
      const isCritical = (issues?.criticalCount ?? 0) > 0
      const progress = o.staffRecordId ? (progressByStaff[o.staffRecordId] ?? 0) : (STATUS_PROGRESS[o.status] ?? 0)
      return {
        name: c ? `${c.firstName} ${c.lastName}`.trim() : 'Unknown',
        email: c?.email || '',
        role: handoff.jobTitle || (o.application as any)?.job?.title || 'Unknown',
        department: handoff.department || (o.application as any)?.job?.department || '',
        manager: handoff.managerName || '',
        stage: STAGE_LABEL[o.status] || 'Pre-boarding',
        startDate: o.startDate ? o.startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : '',
        progress,
        issueCount: isCritical ? (issues?.criticalCount ?? 0) : (issues?.pendingCount ?? 0),
        isCritical,
      }
    })

    const monthLabel = anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })
    const buffer = await buildOnboardingReportWorkbook(reportRows, { companyName: company.companyName, monthLabel })

    const safeCompany = company.companyName.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Company'
    const fileName = `Onboarding Report (${safeCompany}) ${monthLabel}.xlsx`
    const ascii = fileName.replace(/[^ -~]/g, '-')

    return withCors(
      new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          'Cache-Control': 'no-store',
        },
      }),
      origin
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}
