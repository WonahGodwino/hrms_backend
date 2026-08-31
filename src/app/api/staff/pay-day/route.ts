// src/app/api/staff/pay-day/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET: Retrieve pay dates for staff dashboard
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRoleAsync(token, ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    // Resolve companyId: always respect frontend-provided companyId first
    // This supports the global company switcher in the Topbar
    const { searchParams } = new URL(request.url)
    const queryCompanyId = searchParams.get('companyId')
    const userCompanyIds = user.companyIds || (user.companyId ? [user.companyId] : [])

    let companyId: string

    if (user.role === 'SUPER_ADMIN') {
      if (!queryCompanyId) {
        return withCors(ApiResponse.error('Company ID is required for SUPER_ADMIN', 400), origin)
      }
      companyId = queryCompanyId
    } else if (queryCompanyId && userCompanyIds.includes(queryCompanyId)) {
      // ADMIN/HR with multi-company access: use the frontend-selected company
      companyId = queryCompanyId
    } else if (user.companyId) {
      companyId = user.companyId
    } else if (userCompanyIds.length > 0) {
      // Fallback: use the first assigned company when user.companyId is null
      companyId = userCompanyIds[0]
    } else {
      return withCors(ApiResponse.error('No company assigned to this user', 400), origin)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get all active pay dates for the company
    const allPayDates = await prisma.companyPayDate.findMany({
      where: {
        companyId,
        isActive: true
      },
      orderBy: {
        paymentDate: 'asc'
      }
    })

    if (allPayDates.length === 0) {
      return withCors(
        ApiResponse.success({
          payDates: [],
          nextPayDate: null,
          upcomingPayDates: [],
          message: 'No pay dates configured for this company'
        }),
        origin
      )
    }

    // Format all pay dates
    const formattedPayDates = allPayDates.map(pd => ({
      id: pd.id,
      paymentDate: pd.paymentDate.toISOString(),
      paymentCycle: pd.paymentCycle,
      description: pd.description || getDefaultDescription(pd),
      isActive: pd.isActive
    }))

    // Find next pay date (today or future)
    const futurePayDates = allPayDates.filter(pd => pd.paymentDate >= today)
    const nextPayDateRaw = futurePayDates.length > 0 ? futurePayDates[0] : null

    let nextPayDate = null
    if (nextPayDateRaw) {
      const daysRemaining = Math.ceil((nextPayDateRaw.paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      nextPayDate = {
        date: nextPayDateRaw.paymentDate.toISOString(),
        paymentCycle: nextPayDateRaw.paymentCycle,
        description: nextPayDateRaw.description || getDefaultDescription(nextPayDateRaw),
        daysRemaining,
        formattedDate: formatDate(nextPayDateRaw.paymentDate)
      }
    }

    // Get upcoming pay dates for the next 3 months (today + 90 days)
    const threeMonthsLater = new Date(today)
    threeMonthsLater.setMonth(today.getMonth() + 3)
    
    const upcomingPayDatesRaw = allPayDates.filter(pd => 
      pd.paymentDate >= today && pd.paymentDate <= threeMonthsLater
    )

    const upcomingPayDates = upcomingPayDatesRaw.map(pd => ({
      date: pd.paymentDate.toISOString(),
      paymentCycle: pd.paymentCycle,
      description: pd.description || getDefaultDescription(pd),
      formattedDate: formatDate(pd.paymentDate)
    }))

    return withCors(
      ApiResponse.success({
        payDates: formattedPayDates,
        nextPayDate,
        upcomingPayDates
      }),
      origin
    )

  } catch (error) {
    console.error('Error fetching pay dates:', error)
    return withCors(handleApiError(error), origin)
  }
}

// POST: Create/Update pay dates (Admin/HR only)
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await request.json()
    const { companyId: bodyCompanyId, payDates } = body

    const userCompanyIds = user.companyIds || (user.companyId ? [user.companyId] : [])

    let companyId: string

    if (user.role === 'SUPER_ADMIN') {
      if (!bodyCompanyId) {
        return withCors(ApiResponse.error('Company ID is required for SUPER_ADMIN', 400), origin)
      }
      companyId = bodyCompanyId
    } else if (bodyCompanyId && userCompanyIds.includes(bodyCompanyId)) {
      // ADMIN/HR with multi-company access: use the frontend-selected company
      companyId = bodyCompanyId
    } else if (user.companyId) {
      companyId = user.companyId
    } else if (userCompanyIds.length > 0) {
      // Fallback: use the first assigned company when user.companyId is null
      companyId = userCompanyIds[0]
    } else {
      return withCors(ApiResponse.error('No company assigned to this user', 400), origin)
    }

    // Validate pay dates array
    if (!payDates || !Array.isArray(payDates) || payDates.length === 0) {
      return withCors(ApiResponse.error('Pay dates array is required', 400), origin)
    }

    // Validate each pay date
    for (const payDate of payDates) {
      if (!payDate.paymentDate) {
        return withCors(ApiResponse.error('Payment date is required for each entry', 400), origin)
      }
      
      const paymentDate = new Date(payDate.paymentDate)
      if (isNaN(paymentDate.getTime())) {
        return withCors(ApiResponse.error('Invalid payment date format', 400), origin)
      }

      if (!payDate.paymentCycle || !['WEEKLY', 'BI_WEEKLY', 'MONTHLY'].includes(payDate.paymentCycle)) {
        return withCors(ApiResponse.error('Invalid payment cycle. Must be WEEKLY, BI_WEEKLY, or MONTHLY', 400), origin)
      }
    }

    // Deactivate all existing pay dates for this company
    await prisma.companyPayDate.updateMany({
      where: { companyId },
      data: { isActive: false }
    })

    // Create new pay dates
    const createdPayDates = []
    for (const payDate of payDates) {
      const created = await prisma.companyPayDate.create({
        data: {
          companyId,
          paymentDate: new Date(payDate.paymentDate),
          paymentCycle: payDate.paymentCycle,
          description: payDate.description || null,
          isActive: true,
          createdBy: user.userId
        }
      })
      createdPayDates.push(created)
    }

    return withCors(
      ApiResponse.success({
        payDates: createdPayDates.map(pd => ({
          id: pd.id,
          paymentDate: pd.paymentDate.toISOString(),
          paymentCycle: pd.paymentCycle,
          description: pd.description,
          isActive: pd.isActive
        })),
        message: `Successfully configured ${createdPayDates.length} pay date(s)`
      }),
      origin
    )

  } catch (error) {
    console.error('Error setting up pay dates:', error)
    return withCors(handleApiError(error), origin)
  }
}

// DELETE: Remove a specific pay date
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const payDateId = searchParams.get('id')

    if (!payDateId) {
      return withCors(ApiResponse.error('Pay date ID is required', 400), origin)
    }

    const payDate = await prisma.companyPayDate.findUnique({
      where: { id: payDateId }
    })

    if (!payDate) {
      return withCors(ApiResponse.error('Pay date not found', 404), origin)
    }

    // Verify access
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId || payDate.companyId !== user.companyId) {
        return withCors(ApiResponse.error('Access denied', 403), origin)
      }
    }

    // Soft delete
    await prisma.companyPayDate.update({
      where: { id: payDateId },
      data: { isActive: false, updatedBy: user.userId }
    })

    return withCors(
      ApiResponse.success(null, 'Pay date removed successfully'),
      origin
    )

  } catch (error) {
    console.error('Error deleting pay date:', error)
    return withCors(handleApiError(error), origin)
  }
}

// ==================== HELPER FUNCTIONS ====================

function getDefaultDescription(payDate: any): string {
  const formattedDate = formatDate(payDate.paymentDate)
  switch (payDate.paymentCycle) {
    case 'WEEKLY':
      return `Weekly pay on ${formattedDate}`
    case 'BI_WEEKLY':
      return `Bi-weekly pay on ${formattedDate}`
    case 'MONTHLY':
      return `Monthly pay on ${formattedDate}`
    default:
      return `Pay on ${formattedDate}`
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}