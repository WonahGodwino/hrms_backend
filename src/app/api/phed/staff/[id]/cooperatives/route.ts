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
    const assignments = await (prisma as any).phedStaffCooperative.findMany({
      where: { staffId: params.id },
      include: { cooperative: true },
    })
    return withCors(ApiResponse.success(assignments), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/phed/staff/:id/cooperatives — assign a cooperative and set the monthly deduction amount
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { cooperativeId, totalAmount } = await req.json()
    if (!cooperativeId) return withCors(ApiResponse.error('cooperativeId is required', 400), origin)

    // Verify staff exists and belongs to the same company
    const staff = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true },
    })
    if (!staff) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && staff.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)

    // Verify the cooperative belongs to the same company
    const coop = await (prisma as any).phedCooperative.findUnique({
      where: { id: cooperativeId },
      select: { id: true, companyId: true, name: true, isActive: true },
    })
    if (!coop || coop.companyId !== staff.companyId)
      return withCors(ApiResponse.notFound('Cooperative not found'), origin)
    if (!coop.isActive)
      return withCors(ApiResponse.error('Cannot assign an inactive cooperative', 400), origin)

    // Check for existing membership
    const existing = await (prisma as any).phedStaffCooperative.findUnique({
      where: { staffId_cooperativeId: { staffId: params.id, cooperativeId } },
    })
    if (existing)
      return withCors(ApiResponse.error(`Staff is already a member of "${coop.name}"`, 409), origin)

    const assignment = await (prisma as any).phedStaffCooperative.create({
      data:    { staffId: params.id, cooperativeId, totalAmount: totalAmount != null ? Number(totalAmount) : 0 },
      include: { cooperative: true },
    })
    return withCors(ApiResponse.success(assignment, `Added to "${coop.name}"`, 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// PUT /api/phed/staff/:id/cooperatives — update monthly deduction amount for an existing membership
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { cooperativeId, totalAmount } = await req.json()
    if (!cooperativeId) return withCors(ApiResponse.error('cooperativeId is required', 400), origin)
    if (totalAmount == null || isNaN(Number(totalAmount)))
      return withCors(ApiResponse.error('totalAmount is required and must be a number', 400), origin)

    const staff = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id }, select: { companyId: true },
    })
    if (!staff) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && staff.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)

    const existing = await (prisma as any).phedStaffCooperative.findUnique({
      where: { staffId_cooperativeId: { staffId: params.id, cooperativeId } },
    })
    if (!existing) return withCors(ApiResponse.notFound('Staff is not a member of this cooperative'), origin)

    const updated = await (prisma as any).phedStaffCooperative.update({
      where:   { staffId_cooperativeId: { staffId: params.id, cooperativeId } },
      data:    { totalAmount: Number(totalAmount) },
      include: { cooperative: true },
    })
    return withCors(ApiResponse.success(updated, 'Cooperative deduction amount updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// DELETE /api/phed/staff/:id/cooperatives — remove a cooperative assignment
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { cooperativeId } = await req.json()
    if (!cooperativeId) return withCors(ApiResponse.error('cooperativeId is required', 400), origin)

    // Ownership check
    const staff = await (prisma as any).phedStaff.findUnique({
      where: { id: params.id }, select: { companyId: true },
    })
    if (!staff) return withCors(ApiResponse.notFound('Staff not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && staff.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Staff not found'), origin)

    await (prisma as any).phedStaffCooperative.delete({
      where: { staffId_cooperativeId: { staffId: params.id, cooperativeId } },
    })
    return withCors(ApiResponse.success(null, 'Cooperative removed'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

