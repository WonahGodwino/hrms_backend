// src/app/api/payroll/resend-email/route.ts - CORRECTED VERSION

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendPayrollNotificationEmail } from '@/app/lib/email'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * POST /api/payroll/resend-email
 *
 * Body:
 * {
 *   staffEmail: string;   // email used during payroll
 *   newEmail?: string;    // optional corrected email
 *   month?: string;       // optional: filter specific month (e.g. "January")
 *   year?: number;        // optional: filter specific year
 * }
 *
 * Behaviour:
 * - HR / SUPER_ADMIN only.
 * - Scoped by companyId.
 * - Finds staffRecord by staffEmail (in that company).
 * - If newEmail is provided, validates it and updates staffRecord.email.
 * - Finds latest PROCESSED payroll (or specific month/year if provided).
 * - Finds corresponding payslip.
 * - Resends payroll notification email.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 1) Auth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for this user', 400),
        origin
      )
    }
    const companyId = user.companyId as string

    // 2) Parse body
    const body = await request.json()
    const {
      staffEmail,
      newEmail,
      month,
      year,
    }: {
      staffEmail: string
      newEmail?: string
      month?: string
      year?: number
    } = body

    if (!staffEmail) {
      return withCors(
        ApiResponse.error('staffEmail is required', 400),
        origin
      )
    }

    // 3) Find staff by current email
    let staff = await prisma.staffRecord.findFirst({
      where: {
        email: staffEmail,
        companyId,
        isActive: true,
      },
    })

    if (!staff) {
      return withCors(
        ApiResponse.error(
          'Staff not found for the provided email in this company',
          404
        ),
        origin
      )
    }

    // 4) If newEmail is provided, validate and update
    if (newEmail && newEmail !== staff.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(newEmail)) {
        return withCors(
          ApiResponse.error('Invalid newEmail format', 400),
          origin
        )
      }

      const existingWithNewEmail = await prisma.staffRecord.findFirst({
        where: {
          companyId,
          email: newEmail.toLowerCase(),
          NOT: { id: staff.id },
        },
      })

      if (existingWithNewEmail) {
        return withCors(
          ApiResponse.error(
            'Another staff already uses this new email in this company',
            400
          ),
          origin
        )
      }

      staff = await prisma.staffRecord.update({
        where: { id: staff.id },
        data: {
          email: newEmail.toLowerCase(),
        },
      })
    }

    // 5) Find latest processed payroll (optionally filtered by month/year)
    const payrollWhere: any = {
      staffRecordId: staff.id,
      companyId,
      status: 'PROCESSED',
    }

    if (month) {
      payrollWhere.month = month
    }
    if (year) {
      payrollWhere.year = year
    }

    const payroll = await prisma.payroll.findFirst({
      where: payrollWhere,
      orderBy: { createdAt: 'desc' },
    })

    if (!payroll) {
      return withCors(
        ApiResponse.error(
          'No processed payroll found for this staff with the given criteria',
          404
        ),
        origin
      )
    }

    // 6) Find the corresponding payslip to get the payslip ID
    const payslip = await prisma.payslip.findFirst({
      where: {
        payrollId: payroll.id,
        staffRecordId: staff.id,
        companyId,
      },
    })

    if (!payslip) {
      return withCors(
        ApiResponse.error(
          'No payslip found for this payroll. Please generate the payslip first.',
          404
        ),
        origin
      )
    }

    // 7) Safely convert Decimal → number
    const rawNet =
      (payroll as any).netSalary ??
      (payroll as any).netPay ??
      0

    const netSalaryNumber = Number(rawNet || 0)

    // 8) Prepare staff data for email function
    const staffData = {
      id: staff.id,
      companyId: staff.companyId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      staffId: staff.staffId,
      department: staff.department,
      position: staff.position,
      isRegistered: staff.isRegistered,
    }

    // 9) Prepare payroll/payslip data for email function
    const payrollData = {
      id: payslip.id, // Use payslip ID for the access link
      month: payroll.month,
      year: payroll.year,
      netSalary: netSalaryNumber,
      isUpdate: true, // Mark as update since this is a resend
    }

    // 10) Send payroll notification email
    const result = await sendPayrollNotificationEmail(staffData, payrollData)

    if (!result.success) {
      return withCors(
        ApiResponse.error(
          `Failed to send email: ${result.error || 'Unknown error'}`,
          500
        ),
        origin
      )
    }

    return withCors(
      ApiResponse.success(
        {
          staffId: staff.staffId,
          emailSentTo: staff.email,
          payrollMonth: payroll.month,
          payrollYear: payroll.year,
          netSalary: netSalaryNumber,
          payslipId: payslip.id,
        },
        'Payroll notification email resent successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}