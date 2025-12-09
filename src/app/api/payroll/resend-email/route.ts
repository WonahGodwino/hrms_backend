// src/app/api/payroll/resend-email/route.ts

import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * POST /api/payroll/resend-email
 *
 * Body:
 * {
 *   payrollId: string;              // required
 *   overrideEmail?: string;         // optional corrected email
 *   updateStaffEmail?: boolean;     // if true, also update StaffRecord.email
 * }
 *
 * - Only HR / SUPER_ADMIN can use this endpoint.
 * - Scoped by companyId (multi-company safe).
 * - Resends the payroll notification email for an already processed payroll.
 * - If overrideEmail is provided, email is sent to that address.
 * - If updateStaffEmail = true and overrideEmail is provided, StaffRecord.email is updated.
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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for this user', 400),
        origin
      )
    }
    const companyId = user.companyId as string

    // 2) Parse body
    const body = await request.json().catch(() => null)

    if (!body || !body.payrollId) {
      return withCors(
        ApiResponse.error('payrollId is required in the request body', 400),
        origin
      )
    }

    const payrollId: string = body.payrollId
    const overrideEmail: string | undefined =
      typeof body.overrideEmail === 'string'
        ? body.overrideEmail.trim()
        : undefined
    const updateStaffEmail: boolean = Boolean(body.updateStaffEmail)

    // 3) Fetch payroll (scoped by company)
    const payroll = await prisma.payroll.findFirst({
      where: {
        id: payrollId,
        companyId,
      },
    })

    if (!payroll) {
      return withCors(
        ApiResponse.error(
          'Payroll not found for this company or you do not have access',
          404
        ),
        origin
      )
    }

    // 4) Fetch staff record tied to this payroll
    const staffRecord = await prisma.staffRecord.findFirst({
      where: {
        id: payroll.staffRecordId,
        companyId,
        isActive: true,
      },
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error(
          'Staff record linked to this payroll could not be found or is inactive',
          404
        ),
        origin
      )
    }

    // 5) Determine email to send to
    let emailToUse = overrideEmail || staffRecord.email

    if (!emailToUse) {
      return withCors(
        ApiResponse.error(
          'No email address available. Provide overrideEmail or ensure staff has a valid email.',
          400
        ),
        origin
      )
    }

    emailToUse = emailToUse.trim().toLowerCase()

    // Simple email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailToUse)) {
      return withCors(
        ApiResponse.error('overrideEmail is not a valid email address', 400),
        origin
      )
    }

    // 6) Optionally update StaffRecord.email if requested
    if (overrideEmail && updateStaffEmail) {
      try {
        // NOTE: this may fail if another staff in same company already uses that email (unique constraint)
        await prisma.staffRecord.update({
          where: { id: staffRecord.id },
          data: {
            email: emailToUse,
          },
        })
      } catch (err: any) {
        // Unique constraint / DB error
        const msg =
          err?.code === 'P2002'
            ? 'Email already exists for another staff in this company'
            : err?.message || 'Failed to update staff email'

        return withCors(
          ApiResponse.error(
            `Could not update staff email: ${msg}`,
            400
          ),
          origin
        )
      }
    }

    // 7) Send the email (using possibly updated staff + emailToUse)
    const staffForEmail = {
      ...staffRecord,
      email: emailToUse,
    }

    try {
      await sendPayrollNotificationEmail(staffForEmail, {
        month: payroll.month,
        year: payroll.year,
        netSalary: payroll.netSalary ?? payroll.netPay ?? 0,
      })

      return withCors(
        ApiResponse.success(
          {
            payrollId: payroll.id,
            staffId: staffRecord.staffId,
            emailSentTo: emailToUse,
            updatedStaffEmail: overrideEmail && updateStaffEmail ? true : false,
          },
          'Payroll notification email resent successfully'
        ),
        origin
      )
    } catch (err: any) {
      const message = err?.message || 'Failed to send email'
      return withCors(
        ApiResponse.error(
          `Failed to resend payroll email: ${message}`,
          500
        ),
        origin
      )
    }
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
