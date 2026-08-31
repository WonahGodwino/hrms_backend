import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { parseCooperativeMembersCsv } from '@/app/lib/phed/csv-parser'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/cooperatives/:id/upload
// Bulk-assigns (or updates) staff members in a cooperative.
// Each row carries: Staff ID, Contribution Amount, Loan Amount, Total Amount.
// Existing memberships are updated with the new amounts (upsert).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'upload')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const coop = await (prisma as any).phedCooperative.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, name: true, isActive: true },
    })
    if (!coop)          return withCors(ApiResponse.notFound('Cooperative not found'), origin)
    if (!coop.isActive) return withCors(ApiResponse.error('Cooperative is inactive', 400), origin)

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return withCors(ApiResponse.error('file is required', 400), origin)

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'csv'
    if (!['csv', 'xlsx', 'xls'].includes(ext))
      return withCors(ApiResponse.error('Only CSV or Excel files are accepted', 400), origin)

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors: parseErrors } = await parseCooperativeMembersCsv(buffer, ext)

    if (rows.length === 0)
      return withCors(
        ApiResponse.error(
          parseErrors.length > 0 ? parseErrors[0] : 'No valid staff IDs found in file',
          400
        ),
        origin
      )

    // Build staff lookup map (display staffId → database UUID)
    const allStaff = await (prisma as any).phedStaff.findMany({
      where:  { companyId: coop.companyId, isActive: true },
      select: { id: true, staffId: true },
    })
    const staffMap = new Map<string, string>(
      allStaff.map((s: any) => [s.staffId.toLowerCase(), s.id as string])
    )

    let upserted = 0
    let failed   = 0
    const errors: string[] = [...parseErrors]

    // Bounded-concurrency upsert so a large member file doesn't time out.
    const CONCURRENCY = 10
    for (let start = 0; start < rows.length; start += CONCURRENCY) {
      const chunk = rows.slice(start, start + CONCURRENCY)
      await Promise.all(chunk.map(async (row) => {
        const dbId = staffMap.get(row.staffId.toLowerCase())

        if (!dbId) {
          failed++
          errors.push(`Staff ID "${row.staffId}" not found in the system`)
          return
        }

        const contribution = row.contributionAmount
        const loan         = row.loanAmount
        const total        = row.totalAmount

        try {
          await (prisma as any).phedStaffCooperative.upsert({
            where: { staffId_cooperativeId: { staffId: dbId, cooperativeId: params.id } },
            create: {
              staffId:            dbId,
              cooperativeId:      params.id,
              contributionAmount: contribution,
              loanAmount:         loan,
              totalAmount:        total,
            },
            update: {
              contributionAmount: contribution,
              loanAmount:         loan,
              totalAmount:        total,
            },
          })
          upserted++
        } catch (err: any) {
          failed++
          errors.push(`Staff ID "${row.staffId}": ${err.message}`)
        }
      }))
    }

    await (prisma as any).phedBulkUpload.create({
      data: {
        companyId:    coop.companyId,
        type:         'COOPERATIVE_MEMBERS',
        fileName:     file.name,
        totalRecords: rows.length,
        successful:   upserted,
        failed,
        errors:       errors.length > 0 ? errors : undefined,
        uploadedBy:   user.userId,
      },
    })

    if (upserted === 0)
      return withCors(
        ApiResponse.error(`0 records processed. ${errors.length} error(s): ${errors.slice(0, 3).join('; ')}`, 400),
        origin
      )

    return withCors(
      ApiResponse.success(
        { upserted, failed, errors },
        `${upserted} member(s) saved to ${coop.name}` +
        (failed > 0 ? `, ${failed} failed` : '')
      ),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
