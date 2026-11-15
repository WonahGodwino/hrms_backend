// POST /api/trial/demo-staff: HR adds clearly labelled sample employees to a free trial.
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { addDemoStaff } from '@/app/lib/trial/demo'
import { trialErrorBody } from '@/app/lib/trial/guard'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN'])
    if (!user.companyId) return withCors(ApiResponse.error('No company on this account.', 400), origin)
    const result = await addDemoStaff(user.companyId, user.userId)
    return withCors(ApiResponse.success(result, 'Demo staff added.'), origin)
  } catch (error) {
    const trial = trialErrorBody(error)
    if (trial) return withCors(ApiResponse.error(trial.message, trial.status, undefined, { code: trial.code }), origin)
    return withCors(handleApiError(error), origin)
  }
}
