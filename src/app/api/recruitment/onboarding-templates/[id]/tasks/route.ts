// POST /api/recruitment/onboarding-templates/:id/tasks — add a task
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const { id } = await params
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const template = await prisma.onboardingTemplate.findFirst({ where: { id, companyId } })
    if (!template) return withCors(ApiResponse.error('Onboarding template not found', 404), origin)

    const body = await request.json()
    const { title, description, category, assignee, dueOffsetDays } = body
    if (!title?.trim()) return withCors(ApiResponse.error('Title is required', 400), origin)

    const maxOrder = await prisma.onboardingTemplateTask.findFirst({
      where: { templateId: id },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const nextOrder = (maxOrder?.order ?? 0) + 1

    const task = await prisma.onboardingTemplateTask.create({
      data: {
        templateId: id, order: nextOrder,
        title: title.trim(),
        description: description?.trim() || null,
        category: category?.trim() || null,
        assignee: assignee?.trim() || null,
        dueOffsetDays: dueOffsetDays != null ? Number(dueOffsetDays) : 0,
      },
    })

    return withCors(ApiResponse.success({
      id: task.id, order: task.order, title: task.title, description: task.description,
      category: task.category, assignee: task.assignee, dueOffsetDays: task.dueOffsetDays,
    }, 'Task added successfully.', 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
