import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PUT /api/notification-rules/:id
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId, ruleType: 'notification' },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Notification rule not found', 404), origin)
    }

    const { title, name, active, triggerEvent, timing, recipients, channels, escalationRules, subject, body: bodyText } = body

    const existingCond = (rule.condition as any) || {}
    const updatedCond = {
      ...existingCond,
      ...(recipients !== undefined && { recipients }),
      ...(channels !== undefined && { channels }),
      ...(escalationRules !== undefined && { escalationRules }),
      ...(subject !== undefined && { subject }),
      ...(bodyText !== undefined && { body: bodyText }),
    }

    const updated = await prisma.assignmentRule.update({
      where: { id: rule.id },
      data: {
        ...(title !== undefined && { name: title }),
        ...(name !== undefined && { name }),
        ...(active !== undefined && { enabled: Boolean(active) }),
        ...(triggerEvent !== undefined && { trigger: triggerEvent }),
        ...(timing !== undefined && { startOption: timing }),
        condition: updatedCond,
      },
    })

    const cond = (updated.condition as any) || {}
    const data = {
      id: updated.id,
      title: updated.name,
      active: updated.enabled,
      triggerEvent: updated.trigger,
      timing: updated.startOption,
      recipients: cond.recipients,
      channels: cond.channels,
      escalationRules: cond.escalationRules,
      subject: cond.subject,
      body: cond.body,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return withCors(ApiResponse.success(data, 'Notification rule updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// DELETE /api/notification-rules/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId, ruleType: 'notification' },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Notification rule not found', 404), origin)
    }

    await prisma.assignmentRule.delete({ where: { id: rule.id } })

    return withCors(ApiResponse.success(null, 'Notification rule deleted'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
