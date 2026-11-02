import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildConfigTemplate } from '@/app/lib/phed/config-template'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/grades/template?companyId=xxx
// Downloads the grade bulk-upload Excel template.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const buffer = await buildConfigTemplate({
      columns: [
        { header: 'Grade Name *', note: 'Name of the grade (e.g. Officer IV, General Manager). One grade per row, starting at row 3.', width: 28 },
        { header: 'Grade Code *', note: 'Unique grade code (e.g. GL06, GM).', width: 16 },
        { header: 'Category *', note: 'REGULAR, CONTRACT or NYSC/IT.', width: 16, dropdown: ['REGULAR', 'CONTRACT', 'NYSC_IT'] },
        { header: 'Level *', note: 'Grade level number (positive integer, e.g. 6, 9, 14).', width: 12 },
        { header: 'Default Basic Salary', note: 'Optional default monthly basic salary in naira (e.g. 300000).', width: 22 },
      ],
    })

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="phed-grades-template.xlsx"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return withCors(ApiResponse.error('Failed to generate template', 500), origin)
  }
}
