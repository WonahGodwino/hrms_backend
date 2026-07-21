import { NextRequest, NextResponse } from 'next/server'
import { handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// This endpoint is deprecated. Salary data is now entered at staff onboarding.
// The template issue/upload flow has been removed from the payroll process.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new NextResponse(
    JSON.stringify({ error: 'This step has been removed. Salary data is now captured at onboarding — proceed directly to Compute after closing validation.' }),
    { status: 410, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin ?? '*' } }
  )
}
