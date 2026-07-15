// POST /api/meetings/:id/admit — host/privileged only. Lobby control: admit a
// waiting guest into the call, or deny (remove) them.
// Body: { identity, admit: boolean }  (identity = the LiveKit participant id)
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getMeetingProvider } from '@/app/lib/meetings/provider'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

const ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER', 'STAFF']
const PRIVILEGED = ['HR', 'ADMIN', 'SUPER_ADMIN']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ROLES)
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const identity = body.identity ? String(body.identity) : ''
    const admit = body.admit !== false // default to admit unless explicitly false
    if (!identity) return withCors(ApiResponse.error('identity is required', 400), origin)

    const meeting: any = await (prisma as any).meeting.findUnique({
      where: { id }, include: { participants: true },
    })
    if (!meeting) return withCors(ApiResponse.error('Meeting not found', 404), origin)

    const isHost = meeting.participants.some((p: any) => p.staffId === user.userId && p.role === 'HOST')
    const isPrivileged = PRIVILEGED.includes(user.role) &&
      (user.companyId === meeting.companyId || (user.companyIds || []).includes(meeting.companyId))
    if (!isHost && !isPrivileged && meeting.createdBy !== user.userId) {
      return withCors(ApiResponse.error('Only the host can admit participants', 403), origin)
    }

    const provider = getMeetingProvider()
    if (!provider.isConfigured()) return withCors(ApiResponse.error('Meeting provider is not configured', 503), origin)

    if (admit) {
      await provider.admitParticipant(meeting.roomName, identity)
      return withCors(ApiResponse.success({ identity, admitted: true }, 'Participant admitted'), origin)
    }
    await provider.removeParticipant(meeting.roomName, identity)
    return withCors(ApiResponse.success({ identity, admitted: false }, 'Participant denied'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
