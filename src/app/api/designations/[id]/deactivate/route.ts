import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const user = await getUserFromToken(token)
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role)) return withCors(ApiResponse.error('Unauthorized', 403), origin)

    const { id } = await params
    const { transferTo } = await req.json()
    const companyId = user.role === 'SUPER_ADMIN' ? undefined : user.companyId

    const existing = await (prisma as any).designation.findUnique({ where: { id } })
    if (!existing || (companyId && existing.companyId !== companyId)) return withCors(ApiResponse.error('Designation not found', 404), origin)
    if (existing.status === 'Inactive') return withCors(ApiResponse.error('Already inactive', 400), origin)

    const staffCount = await prisma.staffRecord.count({ where: { designationId: id } })

    if (staffCount > 0 && !transferTo) {
      return withCors(ApiResponse.error(`This designation has ${staffCount} staff assigned. Provide a transferTo designation ID.`, 400), origin)
    }

    if (transferTo) {
      const target = await (prisma as any).designation.findUnique({ where: { id: transferTo } })
      if (!target) return withCors(ApiResponse.error('Transfer target not found', 404), origin)

      await prisma.staffRecord.updateMany({ where: { designationId: id }, data: { designationId: transferTo } })
      await (prisma as any).designation.update({ where: { id: transferTo }, data: { staffCount: { increment: staffCount } } })
    }

    await (prisma as any).designation.update({ where: { id }, data: { status: 'Inactive', staffCount: 0 } })

    return withCors(ApiResponse.success({ id, status: 'Inactive', staffTransferred: transferTo ? staffCount : 0 }, 'Designation deactivated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}