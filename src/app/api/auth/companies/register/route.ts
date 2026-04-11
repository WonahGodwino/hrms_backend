// src/app/api/companies/register/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { isValidCurrencyCode, normalizeCurrencyCode } from '@/app/lib/currency'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { verifyToken } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 1. Get authorization token from header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return withCors(
        ApiResponse.error('Authorization token is required', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    
    // 2. Verify token and check if user is SUPER_ADMIN
    const decoded = verifyToken(token)
    if (!decoded) {
      return withCors(
        ApiResponse.error('Invalid or expired token', 401),
        origin
      )
    }

    if (decoded.role !== 'SUPER_ADMIN') {
      return withCors(
        ApiResponse.error('Only SUPER_ADMIN can register companies', 403),
        origin
      )
    }

    // 3. Parse request body
    const body = await request.json()
    const {
      companyName,
      address,
      phone,
      email,
      logo,
      taxId,
      baseCurrency
    } = body || {}

    const normalizedBaseCurrency = baseCurrency
      ? String(baseCurrency).trim().toUpperCase()
      : 'NGN'

    if (!isValidCurrencyCode(normalizedBaseCurrency)) {
      return withCors(
        ApiResponse.error('Invalid baseCurrency. Use a valid ISO 4217 code', 400),
        origin
      )
    }

    // 4. Validate required fields
    if (!companyName || !companyName.trim()) {
      return withCors(
        ApiResponse.error('Company name is required', 400),
        origin
      )
    }

    // 5. Check if company already exists
    const existingCompany = await prisma.company.findFirst({
      where: {
        OR: [
          { companyName: companyName.trim() },
          ...(email ? [{ email: email.toLowerCase().trim() }] : []),
          ...(taxId ? [{ taxId: taxId.trim() }] : [])
        ]
      }
    })

    if (existingCompany) {
      let errorMessage = 'Company with similar details already exists'
      if (existingCompany.companyName === companyName.trim()) {
        errorMessage = 'Company name already exists'
      } else if (email && existingCompany.email === email.toLowerCase().trim()) {
        errorMessage = 'Company email already exists'
      } else if (taxId && existingCompany.taxId === taxId.trim()) {
        errorMessage = 'Company tax ID already exists'
      }
      
      return withCors(
        ApiResponse.error(errorMessage, 409),
        origin
      )
    }

    // 6. Create company
    const company = await prisma.company.create({
      data: {
        companyName: companyName.trim(),
        address: address?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.toLowerCase().trim() || null,
        logo: logo?.trim() || null,
        taxId: taxId?.trim() || null,
        baseCurrency: normalizeCurrencyCode(normalizedBaseCurrency),
        createdBy: decoded.email || 'SUPER_ADMIN',
        archived: 0
      }
    })

    // 7. Create default AI Settings for the company
    try {
      await prisma.aISettings.create({
        data: {
          companyId: company.id,
          enabled: true,
          monthlyBudget: 100.00,
          costPerReview: 0.02,
          costAlertThreshold: 80,
          defaultService: 'openai',
          defaultModel: 'gpt-3.5-turbo',
          autoShortlistThreshold: 75,
          useForSeniorRoles: true,
          useForTechnicalRoles: true,
          useForManagerRoles: true,
          updatedBy: decoded.email || 'SUPER_ADMIN'
        }
      })
    } catch (aiError) {
      console.warn('⚠️ Could not create AI settings:', aiError)
      // Continue even if AI settings creation fails
    }

    // 8. Return success response
    return withCors(
      ApiResponse.success(
        {
          company: {
            id: company.id,
            companyName: company.companyName,
            email: company.email,
            phone: company.phone,
            address: company.address,
            taxId: company.taxId,
            baseCurrency: company.baseCurrency,
            createdAt: company.createdAt
          },
          message: 'Company registered successfully'
        },
        'Company registration successful'
      ),
      origin
    )

  } catch (error) {
    console.error('❌ Company registration error:', error)
    return withCors(
      handleApiError(error),
      origin
    )
  }
}