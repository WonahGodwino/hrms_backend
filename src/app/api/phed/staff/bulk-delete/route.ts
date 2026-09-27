import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { deletePhedStaffRecord } from '@/app/lib/phed/staff-delete'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/staff/bulk-delete
// Generates a combined CSV history and permanently deletes multiple staff
// members (and all related records) at once.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const staffIds: string[] = Array.isArray(body?.staffIds)
      ? body.staffIds.filter((id: unknown) => typeof id === 'string')
      : []
    if (staffIds.length === 0) return withCors(ApiResponse.error('staffIds is required', 400), origin)
    if (staffIds.length > 200) return withCors(ApiResponse.error('Cannot delete more than 200 staff at once', 400), origin)

    const companyId = user.role === 'SUPER_ADMIN' ? (body.companyId || user.companyId) : user.companyId

    // Fetch compact summaries for the history CSV before deletion.
    const staff = await (prisma as any).phedStaff.findMany({
      where: { id: { in: staffIds }, ...(companyId ? { companyId } : {}) },
      select: {
        id: true, staffId: true, firstName: true, lastName: true, email: true,
        category: true, jobTitle: true, department: true,
      },
    })

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const deletedAt = new Date().toISOString()
    const lines: string[] = ['Staff ID,Name,Email,Category,Job Title,Department,Deleted At']
    for (const s of staff) {
      lines.push(
        `${esc(s.staffId)},${esc(`${s.firstName} ${s.lastName}`)},${esc(s.email)},` +
        `${esc(s.category)},${esc(s.jobTitle)},${esc(s.department)},${esc(deletedAt)}`,
      )
    }

    // Delete each staff record (and all related records).
    for (const s of staff) {
      await deletePhedStaffRecord(s.id)
    }

    const csvContent = lines.join('\n')
    const fileName = `staff-deleted-bulk-${deletedAt.slice(0, 10)}.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Expose-Headers': 'Content-Disposition,X-Delete-Message',
        'X-Delete-Message': encodeURIComponent(`${staff.length} staff permanently deleted. History saved as ${fileName}`),
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
