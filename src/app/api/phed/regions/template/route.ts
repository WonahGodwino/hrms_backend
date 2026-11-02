import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildConfigTemplate } from '@/app/lib/phed/config-template'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/regions/template?companyId=xxx
// Downloads the region bulk-upload Excel template.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const buffer = await buildConfigTemplate({
      columns: [
        { header: 'Region Name *', note: 'Name of the region (e.g. Port Harcourt). One region per row, starting at row 3.', width: 36 },
        { header: 'Code', note: 'Optional short code for the region (e.g. PH).', width: 18 },
      ],
    })

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="phed-regions-template.xlsx"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return withCors(ApiResponse.error('Failed to generate template', 500), origin)
  }
}
