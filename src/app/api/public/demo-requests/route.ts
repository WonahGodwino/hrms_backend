import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/app/lib/db'
import { ApiResponse, formatError, validateEmail } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

const ALLOWED_STATUSES = ['NOT_CONTACTED', 'CONTACTED', 'REJECTED_USAGE', 'USING_APP_NOW']

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const body = await req.json().catch(() => ({}))

    const firstName = String(body?.firstName || '').trim()
    const lastName = String(body?.lastName || '').trim()
    const workEmail = String(body?.workEmail || '').trim().toLowerCase()
    const phone = String(body?.phone || '').trim()
    const companyName = String(body?.companyName || '').trim()
    const jobTitle = String(body?.jobTitle || '').trim()
    const companySize = String(body?.companySize || '').trim()
    const currentHRSystem = String(body?.currentHRSystem || '').trim()
    const message = body?.message ? String(body.message).trim() : null
    const modules = Array.isArray(body?.modules)
      ? body.modules.map((m: unknown) => String(m || '').trim()).filter(Boolean)
      : []

    if (!firstName || !lastName || !workEmail || !phone || !companyName || !jobTitle || !companySize || !currentHRSystem) {
      return withCors(ApiResponse.error('Please complete all required fields.', 400), origin)
    }

    if (!validateEmail(workEmail)) {
      return withCors(ApiResponse.error('Please provide a valid work email address.', 400), origin)
    }

    if (!modules.length) {
      return withCors(ApiResponse.error('Select at least one module of interest.', 400), origin)
    }

    const created = await (prisma as any).demoRequest.create({
      data: {
        id: randomUUID(),
        firstName,
        lastName,
        workEmail,
        phone,
        companyName,
        jobTitle,
        companySize,
        modules,
        currentHRSystem,
        message,
        status: 'NOT_CONTACTED',
        updatedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
    })

    if (!ALLOWED_STATUSES.includes(created.status)) {
      return withCors(ApiResponse.error('Demo request created with invalid status.', 500), origin)
    }

    return withCors(
      ApiResponse.success(
        {
          id: created.id,
          status: created.status,
          createdAt: created.createdAt,
        },
        'Demo request submitted successfully.',
        201,
      ),
      origin,
    )
  } catch (error) {
    return withCors(ApiResponse.error(formatError(error), 500), origin)
  }
}
