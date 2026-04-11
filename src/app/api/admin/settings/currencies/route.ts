import { NextRequest } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getCurrencyName, getCurrencySymbol, getSupportedCurrencies } from '@/app/lib/currency'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const currencies = getSupportedCurrencies().map((code) => ({
      code,
      name: getCurrencyName(code),
      symbol: getCurrencySymbol(code)
    }))

    return withCors(
      ApiResponse.success({
        currencies,
        total: currencies.length
      }, 'Supported currencies fetched successfully'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
