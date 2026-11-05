// [ai-assistant] "Show me what the AI sees for one staff record" — POST { staff, categories? }.
// Runs the real data gate on a real record of this company with the given categories (the unsaved switches on the screen, or the saved
// ones), so the person can check a setting before relying on it. Identity and bank data are hidden whatever is asked. Nothing is sent
// to a provider and nothing is stored.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { gateStaffData } from '@/app/lib/ai/gate'
import { ALL_CATEGORIES, ALWAYS_HIDDEN, categoryOf } from '@/app/lib/ai/categories'

const HIDDEN = '[hidden by company policy]'

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
    const ref = typeof body.staff === 'string' ? body.staff.trim() : ''
    if (!ref) return withCors(ApiResponse.error('Give a staff number or email', 400), origin)

    const saved = (guard.settings?.visibleCategories as string[] | undefined) ?? []
    const requested = Array.isArray(body.categories) ? (body.categories as unknown[]).map(String) : saved
    const visible = requested.filter((c) => (ALL_CATEGORIES as readonly string[]).includes(c) && !(ALWAYS_HIDDEN as readonly string[]).includes(c))

    const record = await prisma.staffRecord.findFirst({
      where: { companyId: guard.companyId, OR: [{ staffId: ref }, { email: { equals: ref, mode: 'insensitive' } }] },
    })
    if (!record) return withCors(ApiResponse.notFound('No staff member found for that staff number or email'), origin)

    const [seen] = gateStaffData([record as unknown as Record<string, unknown>], visible)
    const fields = Object.entries(seen).map(([field, value]) => ({
      field,
      category: categoryOf(field),
      hidden: value === HIDDEN,
      // The value is shown only where the AI would see it; dates are written plainly.
      value: value === HIDDEN ? null : value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null,
    }))
    return withCors(ApiResponse.success({ staffNumber: record.staffId, categories: visible, fields }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}