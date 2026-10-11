import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterOperatorAccess } from '@/app/lib/phed/letter-access'
import { resolveLetterCompany, templateToConfig } from '@/app/lib/phed/letter-service'
import { buildLetterPdf } from '@/app/lib/phed/pdf-letter'
import type { RenderModel } from '@/app/lib/phed/letter-engine/types'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireLetterOperatorAccess(token)

    const url = new URL(req.url)
    const excelRow = Number(url.searchParams.get('row') ?? 0)

    const run = await (prisma as any).phedLetterRun.findUnique({ where: { id: params.id } })
    if (!run) return withCors(ApiResponse.notFound('Run not found'), origin)

    const companyId = resolveLetterCompany(user, url.searchParams.get('companyId'))
    if (!companyId || run.companyId !== companyId) return withCors(ApiResponse.notFound('Run not found'), origin)
    if (user.role === 'HR' && run.operatorId !== user.userId) return withCors(ApiResponse.notFound('Run not found'), origin)

    const row = await (prisma as any).phedLetterRunRow.findFirst({
      where: { runId: params.id, excelRow },
    })
    if (!row || !row.values?.renderModel) {
      return withCors(ApiResponse.error('No valid letter for that row.', 404), origin)
    }

    const template = await (prisma as any).phedLetterTemplate.findUnique({ where: { id: run.templateId } })
    if (!template) return withCors(ApiResponse.error('Template not found.', 404), origin)

    const pdf = await buildLetterPdf(row.values.renderModel as RenderModel, templateToConfig(template))
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-row-${excelRow}.pdf"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (error) {
    return withCors(handleApiError(error), req.headers.get('origin'))
  }
}
