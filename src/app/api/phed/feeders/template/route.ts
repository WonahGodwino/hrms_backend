import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildConfigTemplate } from '@/app/lib/phed/config-template'
import { rejectForeignCompany } from '@/app/lib/phed/company-guard'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/feeders/template?companyId=xxx
// Downloads the feeder bulk-upload Excel template (Region dropdown
// is populated from the company's existing regions).
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = new URL(req.url).searchParams.get('companyId') ?? null
    const foreignCompany = await rejectForeignCompany(user, companyId, origin)
    if (foreignCompany) return foreignCompany

    let regions: { name: string }[] = []
    if (companyId) {
      regions = await forCompany(companyId).phedRegion.findMany({
        where: { isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      })
    }

    const REF_SHEET = 'Reference Data'
    const regionNames = regions.map((r: any) => r.name)

    const buffer = await buildConfigTemplate({
      columns: [
        { header: 'Feeder Name *', note: 'Name of the feeder (e.g. Rumuola Feeder). One feeder per row, starting at row 3.', width: 36 },
        { header: 'Region *', note: `Select the parent region from the dropdown — must match a region in the system.`, width: 32 },
        { header: 'Code', note: 'Optional short code for the feeder.', width: 18 },
      ],
      refSheet: {
        name: REF_SHEET,
        columns: ['REGION'],
        rows: regionNames.map((n) => [n]),
      },
      ...(regionNames.length > 0
        ? {
            rangeDropdowns: [{
              colIndex: 1,
              formula: `'${REF_SHEET}'!$A$2:$A$${regionNames.length + 1}`,
              errorTitle: 'Invalid Region',
              error: `Select a region from the "${REF_SHEET}" sheet`,
            }],
          }
        : {}),
    })

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="phed-feeders-template.xlsx"',
        ...getCorsHeaders(origin),
      },
    })
  } catch (_e) {
    return withCors(ApiResponse.error('Failed to generate template', 500), origin)
  }
}
