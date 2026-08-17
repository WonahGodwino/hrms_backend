// POST /api/meetings/:id/end — host/privileged only. Marks the meeting ENDED
// and best-effort tears down the SFU room. No new join tokens are issued after.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getMeetingProvider } from '@/app/lib/meetings/provider'
import { hasModuleAccess } from '@/app/lib/module-access'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { id } = await params

    const meeting: any = await (prisma as any).meeting.findUnique({
      where: { id }, include: { participants: true },
    })
    if (!meeting) return withCors(ApiResponse.error('Meeting not found', 404), origin)
    const canUseMeetings = await hasModuleAccess(meeting.companyId, 'MEETINGS')
    if (!canUseMeetings) return withCors(ApiResponse.error('This module is not available for your organisation', 403), origin)

    const isHost = meeting.participants.some((p: any) => p.staffId === user.userId && p.role === 'HOST')
    const isPrivileged = PRIVILEGED.includes(user.role) &&
      (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId))
    if (!isHost && !isPrivileged && meeting.createdBy !== user.userId) {
      return withCors(ApiResponse.error('Only the host can end this meeting', 403), origin)
    }

    await (prisma as any).meeting.update({ where: { id }, data: { status: 'ENDED' } })
    // Stop any in-progress recording first — deleting the room doesn't
    // guarantee the egress job gets closed out. Keep recordingEgressId: the
    // egress_ended webhook still needs it to resolve this meeting to READY/FAILED.
    if (meeting.recordingEgressId && meeting.recordingRequested) {
      await getMeetingProvider().stopRecording(meeting.recordingEgressId).catch(() => {})
      await (prisma as any).meeting.update({
        where: { id }, data: { recordingRequested: false, recordingStatus: 'PROCESSING' },
      }).catch(() => {})
    }
    await getMeetingProvider().endRoom(meeting.roomName).catch(() => {})

    return withCors(ApiResponse.success({ id, status: 'ENDED' }, 'Meeting ended'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
