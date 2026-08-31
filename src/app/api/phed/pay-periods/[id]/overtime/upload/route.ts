import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseOvertimeCsv } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (['APPROVED', 'PAID'].includes(period.status))
      return withCors(ApiResponse.error('Cannot upload overtime for approved/paid periods', 400), origin)

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    const ext    = file.name.split('.').pop()?.toLowerCase() || 'csv'
    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors: parseErrors } = await parseOvertimeCsv(buffer, ext)

    const staff    = await (prisma as any).phedStaff.findMany({ where: { companyId: period.companyId }, select: { id: true, staffId: true } })
    const staffMap = new Map(staff.map((s: any) => [s.staffId.toLowerCase(), s.id]))

    let successful = 0
    let failed     = 0
    const errors   = [...parseErrors]

    // Bounded-concurrency upsert so a large overtime file doesn't time out.
    const CONCURRENCY = 10
    for (let start = 0; start < rows.length; start += CONCURRENCY) {
      const chunk = rows.slice(start, start + CONCURRENCY)
      await Promise.all(chunk.map(async (row) => {
        const dbId = staffMap.get(row.staffId.toLowerCase())
        if (!dbId) { failed++; errors.push(`Staff ID "${row.staffId}" not found`); return }

        try {
          await (prisma as any).phedOvertimeEntry.upsert({
            where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: dbId } },
            create: {
              payPeriodId:   params.id,
              staffId:       dbId,
              companyId:     period.companyId,
              overtimeHours: Number(row.overtimeHours),
            },
            update: { overtimeHours: Number(row.overtimeHours), computedAmount: null },
          })
          successful++
        } catch (err: any) {
          failed++
          errors.push(`Staff ${row.staffId}: ${err.message}`)
        }
      }))
    }

    await (prisma as any).phedBulkUpload.create({
      data: {
        companyId:    period.companyId,
        payPeriodId:  params.id,
        type:         'OVERTIME',
        fileName:     file.name,
        totalRecords: rows.length,
        successful,
        failed,
        errors:       errors.length > 0 ? errors : undefined,
        uploadedBy:   user.userId,
      },
    })

    if (successful === 0 && rows.length > 0)
      return withCors(ApiResponse.error(`All ${rows.length} row(s) failed. Errors: ${errors.slice(0, 3).join('; ')}`, 400), origin)

    const message = failed > 0
      ? `${successful} updated, ${failed} failed`
      : `${successful} overtime record(s) updated successfully`

    return withCors(ApiResponse.success({ successful, failed, errors }, message), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

