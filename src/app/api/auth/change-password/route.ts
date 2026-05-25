import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/auth/change-password
// Authenticated user submits their current password and a new password.
// If requirePasswordChange is true on the account, it is cleared after a
// successful change — this is the forced first-login password change flow.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'auth')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = requireRole(token, ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    const { currentPassword, newPassword } = await req.json()

    if (!currentPassword || !newPassword)
      return withCors(ApiResponse.error('currentPassword and newPassword are required', 400), origin)

    if (newPassword.length < 8)
      return withCors(ApiResponse.error('New password must be at least 8 characters', 400), origin)

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId } })
    if (!staff || !staff.password)
      return withCors(ApiResponse.error('Account not found', 404), origin)

    const ok = await bcrypt.compare(currentPassword, staff.password)
    if (!ok)
      return withCors(ApiResponse.error('Current password is incorrect', 401), origin)

    const hashed = await bcrypt.hash(newPassword, 10)

    await prisma.staffRecord.update({
      where: { id: user.userId },
      data:  {
        password:             hashed,
        requirePasswordChange: false,
        updatedBy:            user.userId,
      } as any,
    })

    return withCors(ApiResponse.success(null, 'Password changed successfully'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
