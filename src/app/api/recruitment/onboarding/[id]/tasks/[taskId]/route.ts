// PATCH  /api/recruitment/onboarding/:id/tasks/:taskId — update a task (fields / completion).
// DELETE /api/recruitment/onboarding/:id/tasks/:taskId — soft-delete (archive) a task.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { loadScopedOnboarding, applyNote, fetchNotes, shapeTask, parseDueDate } from '@/app/lib/onboarding/tasks'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

async function loadTask(id: string, taskId: string, companyId: string) {
  const onboarding = await loadScopedOnboarding(id, companyId)
  if (!onboarding) return { onboarding: null, task: null }
  const task = await prisma.onboardingTask.findFirst({ where: { id: taskId, onboardingId: id, archived: 0 } })
  return { onboarding, task }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id, taskId } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const { onboarding, task } = await loadTask(id, taskId, companyId)
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)
    if (!task) return withCors(ApiResponse.error('Task not found', 404), origin)

    const body = await request.json().catch(() => ({}))
    const data: any = { updatedAt: new Date() }

    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
    if (typeof body.description === 'string') data.description = body.description.trim() || null
    if (typeof body.category === 'string' && body.category.trim()) data.department = body.category.trim()
    if (typeof body.assignee === 'string') data.assigneeId = body.assignee.trim() || null
    if ('dueDate' in body) data.dueDate = parseDueDate(body.dueDate)

    // Completion toggle: accept `completed` boolean or explicit `status`.
    if (typeof body.completed === 'boolean') {
      data.status = body.completed ? 'DONE' : 'PENDING'
      data.completedAt = body.completed ? new Date() : null
    } else if (typeof body.status === 'string') {
      const s = body.status.toUpperCase()
      if (['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED'].includes(s)) {
        data.status = s
        data.completedAt = s === 'DONE' ? new Date() : null
      }
    }

    const updated = await prisma.onboardingTask.update({ where: { id: taskId }, data })

    if (typeof body.note === 'string') await applyNote(taskId, body.note)
    const notes = await fetchNotes(id)

    return withCors(
      ApiResponse.success({ task: shapeTask(updated, notes[taskId], onboarding.candidateName) }, 'Task updated.'),
      origin
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id, taskId } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const { onboarding, task } = await loadTask(id, taskId, companyId)
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)
    if (!task) return withCors(ApiResponse.error('Task not found', 404), origin)

    await prisma.onboardingTask.update({ where: { id: taskId }, data: { archived: 1 } })
    return withCors(ApiResponse.success({ id: taskId }, 'Task removed.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
