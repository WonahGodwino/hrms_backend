// GET  /api/recruitment/onboarding/:id/tasks — list an onboarding's tasks grouped by category.
// POST /api/recruitment/onboarding/:id/tasks — create one task, or many (template apply).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import {
  loadScopedOnboarding,
  fetchNotes,
  applyNote,
  shapeTask,
  groupByCategory,
  parseDueDate,
} from '@/app/lib/onboarding/tasks'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const onboarding = await loadScopedOnboarding(id, companyId)
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)

    const tasks = await prisma.onboardingTask.findMany({
      where: { onboardingId: id, archived: 0 },
      orderBy: { createdAt: 'asc' },
    })
    const notes = await fetchNotes(id)
    const candidateName = onboarding.candidateName
    const shaped = tasks.map((t) => shapeTask(t, notes[t.id], candidateName))

    return withCors(ApiResponse.success({ sections: groupByCategory(shaped) }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const onboarding = await loadScopedOnboarding(id, companyId)
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)

    const body = await request.json().catch(() => ({}))
    // Accept a single task or a batch (used when applying a template).
    const incoming: any[] = Array.isArray(body?.tasks) ? body.tasks : [body]

    const created: any[] = []
    for (const item of incoming) {
      const title = typeof item?.title === 'string' ? item.title.trim() : ''
      if (!title) continue
      const task = await prisma.onboardingTask.create({
        data: {
          onboardingId: id,
          title,
          description: typeof item?.description === 'string' ? item.description.trim() : null,
          department: typeof item?.category === 'string' && item.category.trim() ? item.category.trim() : 'General',
          assigneeId: typeof item?.assignee === 'string' && item.assignee.trim() ? item.assignee.trim() : null,
          dueDate: parseDueDate(item?.dueDate),
          status: 'PENDING',
          createdBy: actor,
        },
      })
      const note = typeof item?.note === 'string' ? item.note : ''
      if (note) await applyNote(task.id, note)
      created.push(shapeTask({ ...task, note }, note, onboarding.candidateName))
    }

    if (!created.length) {
      return withCors(ApiResponse.error('A task title is required', 400), origin)
    }

    return withCors(ApiResponse.success({ created }, `${created.length} task(s) created.`), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
