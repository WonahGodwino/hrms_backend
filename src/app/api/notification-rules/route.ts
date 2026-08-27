import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/notification-rules
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
    const search = searchParams.get('search')?.trim()

    const where: any = {
      companyId,
      ruleType: 'notification',
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' }
    }

    const [total, rules] = await Promise.all([
      prisma.assignmentRule.count({ where }),
      prisma.assignmentRule.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const items = rules.map((r) => {
      const cond = (r.condition as any) || {}
      return {
        id: r.id,
        title: r.name,
        active: r.enabled,
        triggerEvent: r.trigger || 'training_assigned',
        timing: r.startOption || 'immediately',
        recipients: cond.recipients || ['employee', 'direct_manager'],
        channels: cond.channels || ['email', 'inapp'],
        escalationRules: cond.escalationRules || [
          { id: 'step-1', type: 'manager', days: 3 },
          { id: 'step-2', type: 'hr_admin', days: 7 },
        ],
        subject: cond.subject || 'New Training Assigned: {Training Name}',
        body:
          cond.body ||
          'Hi {Employee Name},\n\nYou have been assigned {Training Name}. Please complete this by {Due Date}.',
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }
    })

    return withCors(
      ApiResponse.success({
        items,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/notification-rules
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const {
      companyId: requestedCompanyId,
      title,
      name,
      active,
      triggerEvent,
      timing,
      recipients,
      channels,
      escalationRules,
      subject,
      body: bodyText,
    } = body

    const resolved = await resolveRequestCompanyId(
      user,
      requestedCompanyId ?? new URL(req.url).searchParams.get('companyId'),
    )
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rule = await prisma.assignmentRule.create({
      data: {
        companyId,
        name: title || name || 'Notification Rule',
        ruleType: 'notification',
        enabled: active !== undefined ? Boolean(active) : true,
        trigger: triggerEvent || 'training_assigned',
        startOption: timing || 'immediately',
        condition: {
          recipients: recipients || ['employee'],
          channels: channels || ['email', 'inapp'],
          escalationRules: escalationRules || [],
          subject: subject || 'Training Notification',
          body: bodyText || '',
        },
        createdBy: user.userId,
      },
    })

    const cond = (rule.condition as any) || {}
    const data = {
      id: rule.id,
      title: rule.name,
      active: rule.enabled,
      triggerEvent: rule.trigger,
      timing: rule.startOption,
      recipients: cond.recipients,
      channels: cond.channels,
      escalationRules: cond.escalationRules,
      subject: cond.subject,
      body: cond.body,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }

    return withCors(ApiResponse.success(data, 'Notification rule created', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
