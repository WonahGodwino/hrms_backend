// GET    /api/recruitment/onboarding-templates/:id — template detail with tasks
// PATCH  /api/recruitment/onboarding-templates/:id — rename/update description
// DELETE /api/recruitment/onboarding-templates/:id — soft-archive
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const { id } = await params
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const template = await prisma.onboardingTemplate.findFirst({
      where: { id, companyId },
      include: { tasks: { orderBy: { order: 'asc' } } },
    })
    if (!template) return withCors(ApiResponse.error('Onboarding template not found', 404), origin)

    return withCors(ApiResponse.success({
      id: template.id, name: template.name, description: template.description, status: template.status,
      tasks: template.tasks.map((t) => ({
        id: t.id, order: t.order, title: t.title, description: t.description,
        category: t.category, assignee: t.assignee, dueOffsetDays: t.dueOffsetDays,
      })),
    }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const update: any = { updatedBy: user.userId }
    if (body.name !== undefined) {
      if (!String(body.name).trim()) return withCors(ApiResponse.error('Template name cannot be empty', 400), origin)
      update.name = String(body.name).trim()
    }
    if (body.description !== undefined) update.description = body.description ? String(body.description).trim() : null

    const updated = await prisma.onboardingTemplate.update({ where: { id }, data: update })

    return withCors(ApiResponse.success({ id: updated.id, name: updated.name, description: updated.description, status: updated.status }, 'Template updated successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    await prisma.onboardingTemplate.update({ where: { id }, data: { archived: 1, status: 'ARCHIVED', updatedBy: user.userId } })

    return withCors(ApiResponse.success(null, 'Template archived successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
