// GET /api/business-units/template/download
// Returns the CSV template for bulk-importing Business Units.
import { NextRequest } from 'next/server'
import { getUserFromToken } from '@/app/lib/auth'
import { handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = token ? await getUserFromToken(token) : null
    if (!user || !['ADMIN', 'HR', 'SUPER_ADMIN'].includes(user.role)) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' },
      })
    }

    const csv = [
      'Name,Code,CostCenter,Description',
      '"Commercial Operations","CO-001","CC-1000","Sales, marketing and partnerships"',
      '"Technology","TECH-001","CC-2000","Engineering and product delivery"',
    ].join('\n')

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="business_unit_template.csv"',
        'Access-Control-Allow-Origin': origin || '*',
      },
    })
  } catch {
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' },
    })
  }
}
