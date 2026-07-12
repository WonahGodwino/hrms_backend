// GET/POST /api/recruitment/assessment-plans/:id/instances
// Re-use a PUBLISHED plan for a specific Job and/or Designation with an editable
// panel per round. POST creates the instance (panel defaults to the plan's
// template panel when omitted) and emails the panel with the role + round detail.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveRecruitmentCompanyId } from '@/app/lib/recruitment/companyScope'
import { notifyPlanInstance } from '@/app/lib/assessments/panel-notify'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// Only keep valid panellist objects: { staffId, name?, email?, role? }.
function cleanMembers(arr: any): any[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((m) => {
      if (!m || typeof m !== 'object') return null
      const staffId = String(m.staffId || m.id || '').trim()
      if (!staffId) return null
      return { staffId, name: m.name || '', email: m.email || null, role: m.role || null }
    })
    .filter(Boolean)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const scope = await resolveRecruitmentCompanyId(user, body?.companyId || new URL(req.url).searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    // Plan must exist, be in this company, and be published.
    const plan = await prisma.recruitmentAssessmentPlan.findFirst({
      where: { id, companyId },
      include: { rounds: { orderBy: { order: 'asc' }, select: { id: true, requiredInterviewers: true } } },
    })
    if (!plan) return withCors(ApiResponse.error('Assessment plan not found', 404), origin)
    if (plan.status !== 'ACTIVE') return withCors(ApiResponse.error('Only a published plan can be re-used', 400), origin)

    const jobId = body.jobId ? String(body.jobId).trim() : null
    const designationId = body.designationId ? String(body.designationId).trim() : null
    if (!jobId && !designationId) {
      return withCors(ApiResponse.error('Select a job or a designation to re-use this plan for', 400), origin)
    }
    if (jobId) {
      const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true } })
      if (!job) return withCors(ApiResponse.error('Selected job not found for this company', 400), origin)
    }
    if (designationId) {
      const des = await (prisma as any).designation.findFirst({ where: { id: designationId, companyId }, select: { id: true } })
      if (!des) return withCors(ApiResponse.error('Selected designation not found for this company', 400), origin)
    }

    // Panel per round: use the provided (edited) panel, else default from the
    // plan template's requiredInterviewers.
    const roundIds = new Set(plan.rounds.map((r) => r.id))
    let panelByRound: Record<string, any[]> = {}
    if (body.panelByRound && typeof body.panelByRound === 'object') {
      for (const [rid, members] of Object.entries(body.panelByRound as Record<string, any>)) {
        if (roundIds.has(rid)) panelByRound[rid] = cleanMembers(members)
      }
    } else {
      for (const r of plan.rounds) {
        panelByRound[r.id] = cleanMembers(r.requiredInterviewers)
      }
    }

    const granter = await prisma.staffRecord.findFirst({
      where: { id: user.userId }, select: { firstName: true, lastName: true },
    })

    const instance = await (prisma as any).assessmentPlanInstance.create({
      data: {
        companyId,
        planId: id,
        jobId,
        designationId,
        panelByRound,
        status: 'ACTIVE',
        createdBy: user.userId,
        createdByName: granter ? `${granter.firstName || ''} ${granter.lastName || ''}`.trim() : (user.email || ''),
        notifiedAt: new Date(),
      },
    })

    // Email the panel (fire-and-forget).
    void notifyPlanInstance(instance.id)
      .then((r) => console.log(`[PLAN_INSTANCE] Panel notified for ${instance.id}:`, r))
      .catch((err) => console.error(`[PLAN_INSTANCE] Notify failed for ${instance.id}:`, err))

    return withCors(ApiResponse.success({
      id: instance.id,
      planId: id,
      jobId,
      designationId,
      status: 'ACTIVE',
    }, 'Plan re-used and panel notified.', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const scope = await resolveRecruitmentCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (scope.error) return withCors(ApiResponse.error(scope.error.message, scope.error.status), origin)
    const companyId = scope.companyId as string

    const instances: any[] = await (prisma as any).assessmentPlanInstance.findMany({
      where: { companyId, planId: id, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    })

    const jobIds = Array.from(new Set(instances.map((i) => i.jobId).filter(Boolean)))
    const desIds = Array.from(new Set(instances.map((i) => i.designationId).filter(Boolean)))
    const [jobs, designations] = await Promise.all([
      jobIds.length ? prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
      desIds.length ? (prisma as any).designation.findMany({ where: { id: { in: desIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
    ])
    const jobById = new Map(jobs.map((j: any) => [j.id, j.title]))
    const desById = new Map((designations as any[]).map((d) => [d.id, d.title]))

    const data = instances.map((i) => ({
      id: i.id,
      jobId: i.jobId,
      jobTitle: i.jobId ? (jobById.get(i.jobId) || null) : null,
      designationId: i.designationId,
      designationTitle: i.designationId ? (desById.get(i.designationId) || null) : null,
      panelSize: i.panelByRound && typeof i.panelByRound === 'object'
        ? new Set(Object.values(i.panelByRound as Record<string, any[]>).flat().map((m: any) => m?.staffId).filter(Boolean)).size
        : 0,
      createdBy: i.createdByName || '',
      createdAt: i.createdAt,
      notifiedAt: i.notifiedAt,
    }))

    return withCors(ApiResponse.success(data, 'Plan instances fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
