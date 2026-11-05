// PATCH  /api/recruitment/onboarding-templates/:id/tasks/:taskId — update task
// DELETE /api/recruitment/onboarding-templates/:id/tasks/:taskId — remove task
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const { id, taskId } = await params
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const task = await prisma.onboardingTemplateTask.findFirst({ where: { id: taskId, templateId: id } })
    if (!task) return withCors(ApiResponse.error('Task not found', 404), origin)

    const body = await request.json()
    const update: any = {}
    if (body.title !== undefined) update.title = String(body.title).trim()
    if (body.description !== undefined) update.description = body.description ? String(body.description).trim() : null
    if (body.category !== undefined) update.category = body.category ? String(body.category).trim() : null
    if (body.assignee !== undefined) update.assignee = body.assignee ? String(body.assignee).trim() : null
    if (body.dueOffsetDays !== undefined) update.dueOffsetDays = body.dueOffsetDays != null ? Number(body.dueOffsetDays) : 0

    const updated = await prisma.onboardingTemplateTask.update({ where: { id: taskId }, data: update })

    return withCors(ApiResponse.success({
      id: updated.id, order: updated.order, title: updated.title, description: updated.description,
      category: updated.category, assignee: updated.assignee, dueOffsetDays: updated.dueOffsetDays,
    }, 'Task updated successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const { id, taskId } = await params
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const task = await prisma.onboardingTemplateTask.findFirst({ where: { id: taskId, templateId: id } })
    if (!task) return withCors(ApiResponse.error('Task not found', 404), origin)

    await prisma.onboardingTemplateTask.delete({ where: { id: taskId } })

    // Reorder remaining tasks.
    const remaining = await prisma.onboardingTemplateTask.findMany({
      where: { templateId: id }, orderBy: { order: 'asc' },
    })
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i + 1) {
        await prisma.onboardingTemplateTask.update({ where: { id: remaining[i].id }, data: { order: i + 1 } })
      }
    }

    return withCors(ApiResponse.success(null, 'Task removed successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
