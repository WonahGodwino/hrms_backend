import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const assignments = await (prisma as any).phedStaffUnion.findMany({
      where: { staffId: params.id },
      include: { union: true },
    })
    return withCors(ApiResponse.success(assignments), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/phed/staff/:id/unions — manually assign a union to this staff member
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { unionId } = await req.json()
    if (!unionId) return withCors(ApiResponse.error('unionId is required', 400), origin)

    // Verify staff exists and belongs to the same company
    const staff = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true },
    })
    if (!staff) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && staff.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)

    // Verify the union belongs to the same company
    const union = await (prisma as any).phedUnion.findUnique({
      where: { id: unionId },
      select: { id: true, companyId: true, name: true, isActive: true },
    })
    if (!union || union.companyId !== staff.companyId)
      return withCors(ApiResponse.notFound('Union not found'), origin)
    if (!union.isActive)
      return withCors(ApiResponse.error('Cannot assign an inactive union', 400), origin)

    // Check for existing membership
    const existing = await (prisma as any).phedStaffUnion.findUnique({
      where: { staffId_unionId: { staffId: params.id, unionId } },
    })
    if (existing)
      return withCors(ApiResponse.error(`Staff is already a member of "${union.name}"`, 409), origin)

    const assignment = await (prisma as any).phedStaffUnion.create({
      data:    { staffId: params.id, unionId },
      include: { union: true },
    })
    return withCors(ApiResponse.success(assignment, `Added to "${union.name}"`, 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// DELETE /api/phed/staff/:id/unions — remove a union assignment
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { unionId } = await req.json()
    if (!unionId) return withCors(ApiResponse.error('unionId is required', 400), origin)

    // Ownership check
    const staff = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id }, select: { companyId: true },
    })
    if (!staff) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && staff.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)

    await (prisma as any).phedStaffUnion.delete({
      where: { staffId_unionId: { staffId: params.id, unionId } },
    })
    return withCors(ApiResponse.success(null, 'Union removed'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

