import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/compliance-rules/options
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const trainings = await prisma.trainingProgram.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, programName: true },
    })

    return withCors(
      ApiResponse.success({
        trainings: trainings.map((t) => ({ id: t.id, name: t.programName })),
        audiences: ['All Employees', 'New Hires', 'Managers', 'Department Only', 'Custom Audience'],
        enforcementLevels: ['Low', 'Moderate', 'High', 'Critical'],
        actions: [
          { label: 'Notify Employee & Manager', value: 'notify' },
          { label: 'Restrict System Access', value: 'restrict' },
          { label: 'Block Promotion Eligibility', value: 'promotion' },
          { label: 'Flag in Annual Review', value: 'review' },
        ],
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
