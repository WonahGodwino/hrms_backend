import { NextRequest } from 'next/server'
import { getUserFromToken } from '@/app/lib/auth'
import { ApiResponse } from '@/app/lib/utils'
import { handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    if (!token) return new Response(JSON.stringify({ success: false, message: 'Authorization header missing' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' } })

    const csv = 'Title,Code,Grade,Description\n"Software Engineer","ENG-001","L3 - Professional","Develops and maintains software applications"\n"Senior Product Manager","PM-004","L4 - Senior","Leads product strategy and roadmap"'

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="designation_template.csv"',
        'Access-Control-Allow-Origin': origin || '*',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' } })
  }
}