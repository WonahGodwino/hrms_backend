import { NextRequest, NextResponse } from 'next/server'
import { handleCorsOptions } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// This endpoint is deprecated. The payroll template is no longer issued per pay period.
// Salary components are entered at staff onboarding and stored on the staff record.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  return new NextResponse(
    JSON.stringify({ error: 'The payroll template download has been removed. Salary data is now captured at onboarding — proceed directly to Compute after closing validation.' }),
    { status: 410, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin ?? '*' } }
  )
}
