import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterAuditAccess } from '@/app/lib/phed/letter-access'
import { resolveLetterCompany } from '@/app/lib/phed/letter-service'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterAuditAccess(token)

    const run = await (prisma as any).phedLetterRun.findUnique({ where: { id: params.id }, select: { companyId: true, operatorId: true } })
    if (!run) return withCors(ApiResponse.notFound('Run not found'), origin)

    const companyId = resolveLetterCompany(user, new URL(req.url).searchParams.get('companyId'))
    if (!companyId || run.companyId !== companyId) return withCors(ApiResponse.notFound('Run not found'), origin)
    if (user.role === 'HR' && run.operatorId !== user.userId) return withCors(ApiResponse.notFound('Run not found'), origin)

    const url = new URL(req.url)
    const severity = url.searchParams.get('severity')?.toUpperCase()
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
    const pageSize = Math.min(1000, Math.max(1, Number(url.searchParams.get('pageSize') ?? 500) || 500))

    const rows = await (prisma as any).phedLetterRunRow.findMany({
      where: { runId: params.id },
      orderBy: { excelRow: 'asc' },
      select: { excelRow: true, employeeId: true, status: true, findings: true },
    })

    const filtered = rows
      .filter((r: any) => (Array.isArray(r.findings) && r.findings.length > 0))
      .map((r: any) => ({
        excelRow: r.excelRow,
        employeeId: r.employeeId,
        status: r.status,
        findings: severity ? r.findings.filter((f: any) => f.severity === severity) : r.findings,
      }))
      .filter((r: any) => r.findings.length > 0)

    const total = filtered.length
    const start = (page - 1) * pageSize
    const paged = filtered.slice(start, start + pageSize)

    return withCors(ApiResponse.success({ rows: paged, total, page, pageSize }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
