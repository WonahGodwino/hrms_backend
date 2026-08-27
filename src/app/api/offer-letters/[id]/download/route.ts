// src/app/api/offer-letters/[id]/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const letter = await prisma.generatedOfferLetter.findUnique({
      where: { id },
      select: { companyId: true, fileData: true, fileName: true },
    })
    if (!letter) {
      return withCors(ApiResponse.error('Offer letter not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, letter.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    return withCors(
      new NextResponse(letter.fileData as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${letter.fileName}"`,
          'Cache-Control': 'private, no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
