import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user) return withCors(ApiResponse.error('Invalid token', 401), origin)

    const { id } = await params
    const designation = await (prisma as any).designation.findUnique({ where: { id } })
    if (!designation) return withCors(ApiResponse.error('Designation not found', 404), origin)

    const staffRecords = await prisma.staffRecord.findMany({
      where: { designationId: id, isActive: true },
      select: { id: true, departmentId: true, department: true },
    })

    const deptMap = new Map<string, { id: string; name: string; staffCount: number }>()
    for (const s of staffRecords) {
      const deptId = s.departmentId || 'none'
      if (!deptMap.has(deptId)) deptMap.set(deptId, { id: deptId, name: s.department || 'Unassigned', staffCount: 0 })
      deptMap.get(deptId)!.staffCount++
    }

    return withCors(ApiResponse.success({
      totalStaffAssigned: staffRecords.length,
      departments: Array.from(deptMap.values()).sort((a, b) => b.staffCount - a.staffCount),
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}