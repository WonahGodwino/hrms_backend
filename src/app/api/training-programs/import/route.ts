import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/training-programs/import
// Body: { companyId?, records: [{ programName, category, trainingType, description, trainer, startDate, endDate, dueDate, ...rest }] }
// Accepts JSON array of program objects (CSV parsing handled on frontend)
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { companyId, records } = body

    const cid = companyId ?? user.companyId
    if (!cid) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && cid !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)
    if (!Array.isArray(records) || records.length === 0)
      return withCors(ApiResponse.error('records array is required', 400), origin)

    const required = ['programName', 'category', 'trainingType', 'description', 'trainer', 'startDate', 'endDate', 'dueDate']
    const errors: { row: number; message: string }[] = []
    const valid: typeof records = []

    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      const missing = required.filter(f => !r[f])
      if (missing.length) { errors.push({ row: i + 1, message: `Missing: ${missing.join(', ')}` }); continue }
      const start = new Date(r.startDate)
      const end   = new Date(r.endDate)
      const due   = new Date(r.dueDate)
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || isNaN(due.getTime()))
        { errors.push({ row: i + 1, message: 'Invalid date format' }); continue }
      if (end < start) { errors.push({ row: i + 1, message: 'endDate must be on or after startDate' }); continue }
      if (due > end)   { errors.push({ row: i + 1, message: 'dueDate must be on or before endDate' }); continue }
      valid.push({ ...r, startDate: start, endDate: end, dueDate: due })
    }

    if (!valid.length)
      return withCors(ApiResponse.error('No valid records to import', 422, errors), origin)

    const created = await prisma.$transaction(
      valid.map((r: any) => {
        const slug = (r.programName as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now() + Math.random().toString(36).slice(2, 6)
        return prisma.trainingProgram.create({
          data: {
            companyId: cid, programName: r.programName, slug, category: r.category,
            trainingType: r.trainingType, description: r.description,
            level: r.level ?? 'Beginner', departments: r.departments ?? [],
            trainer: r.trainer, durationHours: r.durationHours,
            sessionType: r.sessionType ?? 'Single',
            startDate: r.startDate, endDate: r.endDate,
            location: r.location, maxParticipants: r.maxParticipants,
            assessmentRequired: r.assessmentRequired ?? true,
            assessmentType: r.assessmentType ?? 'Quiz',
            passingScore: r.passingScore ?? 80,
            maxAttempts: r.maxAttempts ?? 3,
            autoCertificate: r.autoCertificate ?? true,
            assignmentMethod: r.assignmentMethod ?? 'Automatic Enrollment',
            dueDate: r.dueDate,
            notifyEmployees: r.notifyEmployees ?? true,
            status: 'DRAFT',
            createdBy: user.userId,
          },
        })
      })
    )

    await prisma.trainingAuditLog.create({
      data: {
        companyId: cid, actorId: user.userId,
        action: 'IMPORTED', entityType: 'training_program',
        entityId: created[0]?.id ?? 'bulk',
        metadata: { imported: created.length, skipped: errors.length, programIds: created.map(p => p.id) },
      },
    })

    return withCors(
      ApiResponse.success({ imported: created.length, skipped: errors.length, errors }, `${created.length} program(s) imported`, 201),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
