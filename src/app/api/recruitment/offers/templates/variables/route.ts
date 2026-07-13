// GET /api/recruitment/offers/templates/variables
// Returns the placeholder catalog for the template builder's variable panel,
// plus the system default template body so a company can start from it.
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { extractBearerToken, resolveScopedCompanyIds } from '@/app/api/staff-loans-benefits/_helpers'
import { VARIABLE_CATALOG } from '@/app/lib/offers/template-variables'
import { DEFAULT_OFFER_TEMPLATE_HTML, DEFAULT_OFFER_TEMPLATE_NAME } from '@/app/lib/offers/default-offer-template'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = extractBearerToken(req.headers.get('authorization'))
    if (!token) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    // Group the catalog by category for the builder UI.
    const groups: Record<string, any[]> = {}
    for (const v of VARIABLE_CATALOG) {
      ;(groups[v.category] ||= []).push({ key: v.key, label: v.label, source: v.source, sample: v.sample })
    }

    return withCors(ApiResponse.success({
      variables: VARIABLE_CATALOG,
      groups,
      defaultTemplate: { name: DEFAULT_OFFER_TEMPLATE_NAME, bodyHtml: DEFAULT_OFFER_TEMPLATE_HTML },
    }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
