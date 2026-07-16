import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

const ALLOWED_STATUSES = ['NOT_CONTACTED', 'CONTACTED', 'REJECTED_USAGE', 'USING_APP_NOW']

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['SUPER_ADMIN'])

    const { id } = await params
    const record = await (prisma as any).demoRequest.findUnique({ where: { id } })

    if (!record) {
      return withCors(ApiResponse.notFound('Demo request not found.'), origin)
    }

    return withCors(ApiResponse.success(record), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['SUPER_ADMIN'])

    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const nextStatus = body?.status ? String(body.status).trim().toUpperCase() : null
    const outcomeNote = body?.outcomeNote === undefined ? undefined : (body.outcomeNote ? String(body.outcomeNote).trim() : null)

    if (!nextStatus && outcomeNote === undefined) {
      return withCors(ApiResponse.error('Provide status or outcome note to update.', 400), origin)
    }

    if (nextStatus && !ALLOWED_STATUSES.includes(nextStatus)) {
      return withCors(ApiResponse.error('Invalid status value.', 400), origin)
    }

    const existing = await (prisma as any).demoRequest.findUnique({ where: { id } })
    if (!existing) {
      return withCors(ApiResponse.notFound('Demo request not found.'), origin)
    }

    const updated = await (prisma as any).demoRequest.update({
      where: { id },
      data: {
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(outcomeNote !== undefined ? { outcomeNote } : {}),
        outcomeUpdatedBy: user.userId,
        outcomeUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    return withCors(ApiResponse.success(updated, 'Demo request updated successfully.'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
