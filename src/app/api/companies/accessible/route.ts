// src/app/api/companies/accessible/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN', 'STAFF'])

    let companies: Array<{
      id: string
      companyName: string
      email: string | null
      phone: string | null
      address: string | null
      logo: string | null
      taxId: string | null
    }> = []

    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN gets all companies
      companies = await prisma.company.findMany({
        where: { archived: 0 },
        select: {
          id: true,
          companyName: true,
          email: true,
          phone: true,
          address: true,
          logo: true,
          taxId: true,
        },
        orderBy: { companyName: 'asc' }
      })
    } 
    else if (user.role === 'STAFF') {
      // STAFF only gets their own company
      if (user.companyId) {
        const company = await prisma.company.findUnique({
          where: { id: user.companyId },
          select: {
            id: true,
            companyName: true,
            email: true,
            phone: true,
            address: true,
            logo: true,
            taxId: true,
          }
        })
        companies = company ? [company] : []
      }
    }
    else {
      // HR/ADMIN gets assigned companies
      const userCompanies = await prisma.userCompany.findMany({
        where: { 
          userId: user.userId,
          OR: [
            { role: user.role },
            { role: 'ALL' }
          ]
        },
        include: {
          company: {
            select: {
              id: true,
              companyName: true,
              email: true,
              phone: true,
              address: true,
              logo: true,
              taxId: true,
            }
          }
        }
      })
      
      // Extract companies and filter out nulls
      const allCompanies = userCompanies.map(uc => uc.company)
      companies = allCompanies.filter(company => company !== null) as typeof companies
    }

    return withCors(
      ApiResponse.success(companies, 'Accessible companies retrieved successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error fetching accessible companies:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}