import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const session = await prisma.trainingSession.findFirst({
      where: { id: params.id, companyId: user.companyId },
      include: { trainingProgram: { select: { id: true, programName: true, category: true, status: true } } },
    })
    if (!session) return withCors(ApiResponse.error('Session not found', 404), origin)
    return withCors(ApiResponse.success(session), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const session = await prisma.trainingSession.findFirst({ where: { id: params.id, companyId: user.companyId } })
    if (!session) return withCors(ApiResponse.error('Session not found', 404), origin)

    const body = await req.json()
    const updated = await prisma.trainingSession.update({
      where: { id: params.id },
      data: {
        ...(body.title             !== undefined && { title:             body.title }),
        ...(body.date              !== undefined && { date:              new Date(body.date) }),
        ...(body.time              !== undefined && { time:              body.time }),
        ...(body.type              !== undefined && { type:              body.type }),
        ...(body.trainer           !== undefined && { trainer:           body.trainer }),
        ...(body.capacity          !== undefined && { capacity:          body.capacity }),
        ...(body.location          !== undefined && { location:          body.location }),
        ...(body.duration          !== undefined && { duration:          body.duration }),
        ...(body.summary           !== undefined && { summary:           body.summary }),
        ...(body.status            !== undefined && { status:            body.status }),
        ...(body.participantsCount !== undefined && { participantsCount: body.participantsCount }),
      },
    })
    return withCors(ApiResponse.success(updated, 'Session updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['ADMIN', 'SUPER_ADMIN'])

    const session = await prisma.trainingSession.findFirst({ where: { id: params.id, companyId: user.companyId } })
    if (!session) return withCors(ApiResponse.error('Session not found', 404), origin)

    await prisma.trainingSession.delete({ where: { id: params.id } })
    return withCors(ApiResponse.success(null, 'Session deleted'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
