import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterOperatorAccess } from '@/app/lib/phed/letter-access'
import { auditLetterEvent, clientIp, expireRunIfNeeded, resolveLetterCompany } from '@/app/lib/phed/letter-service'
import { verifyLetterDownloadToken } from '@/app/lib/phed/letter-download-token'
import { readRunFile } from '@/app/lib/phed/letter-storage'
import { createZip } from '@/app/lib/phed/zip-letters'
import { buildRunReportXlsx } from '@/app/lib/phed/letter-report'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const url = new URL(req.url)
    const run = await (prisma as any).phedLetterRun.findUnique({ where: { id: params.id } })
    if (!run) return withCors(ApiResponse.notFound('Run not found'), origin)

    const downloadToken = url.searchParams.get('token')
    let actorId = 'signed-link'

    if (downloadToken) {
      const payload = verifyLetterDownloadToken(downloadToken)
      if (!payload || payload.runId !== params.id || payload.companyId !== run.companyId) {
        return withCors(ApiResponse.unauthorized('Invalid or expired download link'), origin)
      }
    } else {
      const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
      const user = await requireLetterOperatorAccess(token)
      actorId = user.userId
      const companyId = resolveLetterCompany(user, url.searchParams.get('companyId'))
      if (!companyId || run.companyId !== companyId) return withCors(ApiResponse.notFound('Run not found'), origin)
      if (user.role === 'HR' && run.operatorId !== user.userId) return withCors(ApiResponse.notFound('Run not found'), origin)
    }

    if (await expireRunIfNeeded(run)) {
      return withCors(ApiResponse.error('Letter files for this run have expired and were removed.', 410), origin)
    }

    if (!['COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELLED'].includes(run.status)) {
      return withCors(ApiResponse.error('Run has not finished generating.', 409), origin)
    }

    await auditLetterEvent(run.companyId, actorId, 'DOWNLOAD', run.id, 'ZIP downloaded', clientIp(req.headers))

    const generated = await (prisma as any).phedLetterRunRow.findMany({
      where: { runId: params.id, status: 'GENERATED' },
      orderBy: { excelRow: 'asc' },
    })
    const allRows = await (prisma as any).phedLetterRunRow.findMany({
      where: { runId: params.id },
      orderBy: { excelRow: 'asc' },
    })

    const entries = generated
      .filter((r: any) => r.outputKey)
      .map((r: any) => ({ name: path.basename(r.outputKey), data: readRunFile(r.outputKey) }))

    const report = await buildRunReportXlsx(run, allRows)
    entries.push({ name: 'run-report.xlsx', data: report })

    const zip = await createZip(entries)

    return new NextResponse(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="promotion-letters-${run.id}.zip"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (error) {
    return withCors(handleApiError(error), req.headers.get('origin'))
  }
}
