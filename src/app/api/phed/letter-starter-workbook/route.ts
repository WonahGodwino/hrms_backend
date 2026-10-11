import { NextRequest, NextResponse } from 'next/server'
import { handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requireLetterOperatorAccess } from '@/app/lib/phed/letter-access'
import { buildStarterWorkbook } from '@/app/lib/phed/letter-workbook'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireLetterOperatorAccess(token)

    const buffer = await buildStarterWorkbook()
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Promotion Letters Template.xlsx"',
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (error) {
    return withCors(handleApiError(error), req.headers.get('origin'))
  }
}
