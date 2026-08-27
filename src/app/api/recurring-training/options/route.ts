import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/recurring-training/options?companyId=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const programs = await prisma.trainingProgram.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, programName: true },
    })

    return withCors(
      ApiResponse.success({
        trainingPrograms: programs.map((p) => ({ id: p.id, name: p.programName })),
        recurrenceUnits: ['Days', 'Weeks', 'Months', 'Years'],
        startOptions: ['Immediately', 'Specific Date', 'After Completion'],
        endOptions: ['Never Ends', 'After X Occurrences', 'Specific Date'],
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
