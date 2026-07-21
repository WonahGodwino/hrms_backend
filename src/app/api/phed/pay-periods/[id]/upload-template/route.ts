import { NextRequest, NextResponse } from 'next/server'
import { handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// This endpoint is deprecated. Template upload has been removed from the payroll flow.
// Salary components are entered at staff onboarding; only validation and overtime
// uploads are needed during the pay period.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new NextResponse(
    JSON.stringify({ error: 'Template upload has been removed. Salary data is now captured at onboarding — proceed directly to Compute after closing validation.' }),
    { status: 410, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin ?? '*' } }
  )
}
