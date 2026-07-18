// src/app/api/jobs/view/route.ts
// HR, Admin, and Super Admin view
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 🔐 Auth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)

    // Optional filters
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined
    const companyFilter = searchParams.get('companyId') || undefined

    // Pagination (defaults)
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '20')

    const take = pageSize > 0 ? pageSize : 20
    const skip = page > 1 ? (page - 1) * take : 0

    // Build the where clause
    const where: any = {}

    // Company filtering based on user role
    if (user.role === 'HR') {
      // HR can only view jobs from their own company
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR user', 400),
          origin
        )
      }
      where.companyId = user.companyId
    } 
    else if (user.role === 'ADMIN') {
      // ADMIN can view jobs from their assigned companies
      // First, get the companies this ADMIN is assigned to
      const userCompanies = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          role: { in: ['ADMIN', 'ALL'] }
        },
        select: { companyId: true }
      })

      const adminCompanyIds = userCompanies.map(uc => uc.companyId)
      
      if (adminCompanyIds.length === 0) {
        // ADMIN has no assigned companies
        return withCors(
          ApiResponse.success(
            {
              pagination: { total: 0, page: 1, pageSize: take, totalPages: 0 },
              filters: { status: status || null, search: search || null, companyId: companyFilter || null },
              jobs: [],
              accessibleCompanies: []
            },
            'No companies assigned to this administrator'
          ),
          origin
        )
      }

      // If company filter is provided, validate it's in the admin's assigned companies
      if (companyFilter) {
        if (!adminCompanyIds.includes(companyFilter)) {
          return withCors(
            ApiResponse.error('You do not have access to view jobs for this company', 403),
            origin
          )
        }
        where.companyId = companyFilter
      } else {
        // No filter - show all jobs from all assigned companies
        where.companyId = { in: adminCompanyIds }
      }
    }
    else if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can view jobs from all companies
      if (companyFilter) {
        // Validate company exists if filter is provided
        const companyExists = await prisma.company.findFirst({
          where: { 
            id: companyFilter,
            archived: 0 
          }
        })
        
        if (!companyExists) {
          return withCors(
            ApiResponse.error('Company not found or is archived', 404),
            origin
          )
        }
        where.companyId = companyFilter
      }
      // If no company filter, SUPER_ADMIN sees all companies' jobs
    }

    // Additional filters
    if (status) {
      where.status = status
    }

    // Filter by job's archived status (1 = archived, 0 = not archived)
    const archived = searchParams.get('archived')
    if (archived !== undefined && archived !== '') {
      where.archived = archived === '1' ? 1 : 0
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Only show jobs from non-archived companies
    where.company = {
      archived: 0
    }

    // Get accessible companies for the user (for frontend dropdown)
    let accessibleCompanies: Array<{id: string, companyName: string}> = []
    
    if (user.role === 'SUPER_ADMIN') {
      accessibleCompanies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' }
      })
    } else if (user.role === 'ADMIN') {
      const userCompanyRecords = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          role: { in: ['ADMIN', 'ALL'] }
        },
        include: {
          company: {
            select: { id: true, companyName: true }
          }
        }
      })
      
      accessibleCompanies = userCompanyRecords
        .map(uc => uc.company)
        .filter(Boolean)
        .sort((a, b) => a.companyName.localeCompare(b.companyName))
    } else if (user.role === 'HR' && user.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, companyName: true }
      })
      
      if (company) {
        accessibleCompanies = [company]
      }
    }

    // Get jobs with company info
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          company: {
            select: {
              id: true,
              companyName: true,
              email: true,
              logo: true
            }
          },
          _count: {
            select: {
              applications: true
            }
          }
        }
      }),
      prisma.job.count({ where }),
    ])

    const totalPages = Math.ceil(total / take) || 1

    // Format response
    const responseData = {
      pagination: {
        total,
        page,
        pageSize: take,
        totalPages,
      },
      filters: {
        status: status || null,
        search: search || null,
        companyId: companyFilter || null,
      },
      userContext: {
        role: user.role,
        companyId: user.companyId,
        canFilterByCompany: user.role !== 'HR',
        accessibleCompaniesCount: accessibleCompanies.length
      },
      accessibleCompanies,
      jobs: jobs.map(job => ({
        ...job,
        applicationCount: job._count.applications
      })),
    }

    return withCors(
      ApiResponse.success(
        responseData,
        'Jobs fetched successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    console.error('[JOB_VIEW] Error:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}