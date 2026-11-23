import { NextRequest } from 'next/server'
import { handleCorsOptions, getCorsHeaders } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return new Response(JSON.stringify({ success: false, message: 'Authorization header missing' }), { status: 401, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin)} })

    const csv = 'Title,Code,Description\n"Software Engineer","ENG-001","Develops and maintains software applications"\n"Senior Product Manager","PM-004","Leads product strategy and roadmap"'

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="designation_template.csv"',
        ...getCorsHeaders(origin),
      },
    })
  } catch (_e) {
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin)} })
  }
}