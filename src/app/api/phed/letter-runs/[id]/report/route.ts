import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterAuditAccess } from '@/app/lib/phed/letter-access'
import { resolveLetterCompany } from '@/app/lib/phed/letter-service'
import { buildRunReportXlsx } from '@/app/lib/phed/letter-report'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterAuditAccess(token)

    const run = await (prisma as any).phedLetterRun.findUnique({ where: { id: params.id } })
    if (!run) return withCors(ApiResponse.notFound('Run not found'), origin)

    const companyId = resolveLetterCompany(user, new URL(req.url).searchParams.get('companyId'))
    if (!companyId || run.companyId !== companyId) return withCors(ApiResponse.notFound('Run not found'), origin)
    if (user.role === 'HR' && run.operatorId !== user.userId) return withCors(ApiResponse.notFound('Run not found'), origin)

    const rows = await (prisma as any).phedLetterRunRow.findMany({
      where: { runId: params.id },
      orderBy: { excelRow: 'asc' },
    })
    const report = await buildRunReportXlsx(run, rows)

    return new NextResponse(report as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="run-report-${run.id}.xlsx"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (error) {
    return withCors(handleApiError(error), req.headers.get('origin'))
  }
}
