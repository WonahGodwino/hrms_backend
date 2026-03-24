// src/app/api/admin/assign-company/route.ts
// use to assign company to admin and HR by SUPER_ADMIN
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors' // Updated import

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return withCors(new NextResponse(null, { status: 200 }), origin)
}

export async function POST(request: NextRequest) {
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
    const user = requireRole(token, ['SUPER_ADMIN']) // Only SUPER_ADMIN can assign companies

    const body = await request.json()
    const { userId, companyId, role = 'HR' } = body

    if (!userId || !companyId) {
      return withCors(
        ApiResponse.error('User ID and Company ID are required', 400),
        origin
      )
    }

    // Verify user exists
    const userExists = await prisma.staffRecord.findUnique({
      where: { id: userId }
    })

    if (!userExists) {
      return withCors(
        ApiResponse.error('User not found', 404),
        origin
      )
    }

    // Verify company exists
    const companyExists = await prisma.company.findUnique({
      where: { id: companyId }
    })

    if (!companyExists) {
      return withCors(
        ApiResponse.error('Company not found', 404),
        origin
      )
    }

    // Assign company to user
    const userCompany = await prisma.userCompany.upsert({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      },
      update: {
        role
      },
      create: {
        userId,
        companyId,
        role
      }
    })

    return withCors(
      ApiResponse.success(userCompany, 'Company assigned successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error assigning company:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

export async function DELETE(request: NextRequest) {
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
    const user = requireRole(token, ['SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const companyId = searchParams.get('companyId')

    if (!userId || !companyId) {
      return withCors(
        ApiResponse.error('User ID and Company ID are required', 400),
        origin
      )
    }

    await prisma.userCompany.delete({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    })

    return withCors(
      ApiResponse.success(null, 'Company assignment removed successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error removing company assignment:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}