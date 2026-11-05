// [ai-assistant] Dry-run preview — POST { conditions }: how many staff match right now, and who (first five). Changes nothing.
// It uses the same matcher as the scheduled evaluator, so the number shown here is the number the evaluator will count.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { findMatches, sampleOf, validateConditions, RECORD_TYPES, builderCategories } from '@/app/lib/core-setup/custom-rules'
import { isRecordType } from '@/app/lib/core-setup/custom-rule-types'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (body.recordType !== undefined && !isRecordType(body.recordType)) return withCors(ApiResponse.error('Unknown record type', 400, [], { code: 'INVALID_RULE' }), origin)
    const recordType = isRecordType(body.recordType) ? body.recordType : 'staff'
    const visible = builderCategories(guard.settings?.visibleCategories)
    const { conditions, errors } = validateConditions(body.conditions, recordType, visible)
    if (errors.length) return withCors(ApiResponse.error(errors[0], 400, errors, { code: 'INVALID_RULE' }), origin)

    const { total, evaluated, staff } = await findMatches(prisma, guard.companyId, conditions, new Date(), recordType)
    return withCors(ApiResponse.success({ total, evaluated, noun: RECORD_TYPES[recordType].plural, sample: sampleOf(staff, 5) }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
