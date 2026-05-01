import { NextRequest } from 'next/server'
import { z } from 'zod'

import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

const announcementSchema = z.object({
  title: z.string().min(3).max(200),
  message: z.string().min(5).max(2000),
  companyId: z.string().cuid().optional(),
  sendToAllCompanies: z.boolean().optional().default(false)
})

async function getAssignedCompanyIds(userId: string, role: 'HR' | 'ADMIN') {
  const rows = await prisma.userCompany.findMany({
    where: {
      userId,
      role: { in: [role, 'ALL'] },
      company: { archived: 0 }
    },
    select: { companyId: true },
    distinct: ['companyId']
  })

  return rows.map((row) => row.companyId)
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const parsed = announcementSchema.safeParse(await request.json())
    if (!parsed.success) {
      return withCors(ApiResponse.error('Invalid request body', 400), origin)
    }

    const { title, message, companyId, sendToAllCompanies } = parsed.data

    const sender = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { id: true, firstName: true, lastName: true, role: true }
    })

    const senderName = sender
      ? `${sender.firstName} ${sender.lastName}`.trim()
      : 'System Administrator'

    if (user.role === 'SUPER_ADMIN' && sendToAllCompanies) {
      const recipients = await prisma.staffRecord.findMany({
        where: {
          isActive: true,
          role: { in: ['ADMIN', 'HR', 'SUPER_ADMIN'] },
          company: { archived: 0 }
        },
        select: { id: true, companyId: true }
      })

      if (recipients.length === 0) {
        return withCors(ApiResponse.error('No recipients found for global announcement', 404), origin)
      }

      await prisma.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          companyId: recipient.companyId,
          type: NOTIFICATION_TYPES.GLOBAL_ANNOUNCEMENT,
          title,
          message,
          data: JSON.stringify({
            source: 'SUPER_ADMIN_GLOBAL',
            senderId: user.userId,
            senderName,
            senderRole: user.role,
            sentToAllCompanies: true
          }),
          read: false
        }))
      })

      return withCors(
        ApiResponse.success(
          {
            scope: 'ALL_COMPANIES',
            recipients: recipients.length,
            audience: 'ADMIN_HR_SUPER_ADMIN'
          },
          'Global announcement sent successfully'
        ),
        origin
      )
    }

    let targetCompanyId: string | null = companyId || null

    if (user.role === 'HR') {
      const companyIds = await getAssignedCompanyIds(user.userId, 'HR')
      if (companyIds.length === 0) {
        return withCors(ApiResponse.error('No companies assigned to this HR account', 403), origin)
      }

      if (targetCompanyId && !companyIds.includes(targetCompanyId)) {
        return withCors(ApiResponse.error('HR can only send announcements to assigned company', 403), origin)
      }

      targetCompanyId = targetCompanyId || companyIds[0]
    } else if (user.role === 'ADMIN') {
      const companyIds = await getAssignedCompanyIds(user.userId, 'ADMIN')
      if (companyIds.length === 0) {
        return withCors(ApiResponse.error('No companies assigned to this ADMIN account', 403), origin)
      }

      if (targetCompanyId && !companyIds.includes(targetCompanyId)) {
        return withCors(ApiResponse.error('ADMIN can only send announcements to assigned company', 403), origin)
      }

      targetCompanyId = targetCompanyId || companyIds[0]
    } else {
      if (!targetCompanyId) {
        return withCors(ApiResponse.error('companyId is required for SUPER_ADMIN company announcement', 400), origin)
      }

      const exists = await prisma.company.findFirst({
        where: { id: targetCompanyId, archived: 0 },
        select: { id: true }
      })

      if (!exists) {
        return withCors(ApiResponse.error('Selected company not found or archived', 404), origin)
      }
    }

    const staffRecipients = await prisma.staffRecord.findMany({
      where: {
        companyId: targetCompanyId as string,
        isActive: true,
        role: 'STAFF'
      },
      select: { id: true, companyId: true }
    })

    if (staffRecipients.length === 0) {
      return withCors(ApiResponse.error('No active staff recipients found in selected company', 404), origin)
    }

    await prisma.notification.createMany({
      data: staffRecipients.map((recipient) => ({
        userId: recipient.id,
        companyId: recipient.companyId,
        type: NOTIFICATION_TYPES.COMPANY_ANNOUNCEMENT,
        title,
        message,
        data: JSON.stringify({
          source: 'COMPANY_ANNOUNCEMENT',
          senderId: user.userId,
          senderName,
          senderRole: user.role,
          companyId: targetCompanyId
        }),
        read: false
      }))
    })

    return withCors(
      ApiResponse.success(
        {
          scope: 'SELECTED_COMPANY',
          companyId: targetCompanyId,
          recipients: staffRecipients.length,
          audience: 'STAFF'
        },
        'Company announcement sent successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}