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
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN', 'STAFF'])

    // Define select without logo first
    const baseSelect = {
      id: true,
      companyName: true,
      email: true,
      phone: true,
      address: true,
      taxId: true,
    }

    // Try to query with logo, fallback without if error occurs
    async function fetchCompanies(whereClause: any, isSingle = false) {
      try {
        if (isSingle) {
          const result = await prisma.company.findUnique({
            where: whereClause,
            select: { ...baseSelect, logo: true }
          })
          return result ? [result] : []
        } else {
          const result = await prisma.company.findMany({
            where: whereClause,
            select: { ...baseSelect, logo: true },
            orderBy: { companyName: 'asc' }
          })
          return result
        }
      } catch (error: any) {
        // If error is about logo field, try without it
        if (error.message?.includes('logo') || error.message?.includes('Logo')) {
          console.log('Logo field not found, fetching without it')
          if (isSingle) {
            const result = await prisma.company.findUnique({
              where: whereClause,
              select: baseSelect
            })
            return result ? [result] : []
          } else {
            const result = await prisma.company.findMany({
              where: whereClause,
              select: baseSelect,
              orderBy: { companyName: 'asc' }
            })
            return result
          }
        }
        throw error
      }
    }

    let companies: any[] = []

    if (user.role === 'SUPER_ADMIN') {
      companies = await fetchCompanies({ archived: 0 }, false)
    } 
    else if (user.role === 'STAFF') {
      if (user.companyId) {
        companies = await fetchCompanies({ id: user.companyId }, true)
      }
    }
    else {
      // HR/ADMIN - try userCompany first
      if ('userCompany' in prisma) {
        try {
          const userCompanies = await (prisma as any).userCompany.findMany({
            where: { 
              userId: user.userId,
              OR: [
                { role: user.role },
                { role: 'ALL' }
              ]
            },
            include: {
              company: true // Let Prisma decide what fields to include
            }
          })
          
          const allCompanies = userCompanies
            .map((uc: any) => {
              const company = uc.company
              if (!company) return null
              
              // Transform to expected format
              return {
                id: company.id,
                companyName: company.companyName,
                email: company.email,
                phone: company.phone,
                address: company.address,
                logo: company.logo, // Will be undefined if field doesn't exist
                taxId: company.taxId
              }
            })
            .filter((company: any) => company !== null)
          
          companies = allCompanies
        } catch (error) {
          console.warn('Error fetching user companies:', error)
          if (user.companyId) {
            companies = await fetchCompanies({ id: user.companyId }, true)
          }
        }
      } else {
        if (user.companyId) {
          companies = await fetchCompanies({ id: user.companyId }, true)
        }
      }
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