// src/app/api/test-email/route.ts
import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
// import { handleCorsOptions, withCors } from '@/app/lib/cors'

  // CORS is now handled by Nginx. No app-level CORS.
  return new Response(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const body = await req.json().catch(() => ({}))

    const testEmail = body.email as string | undefined
    const month = (body.month as string | undefined) || 'December'
    const year = Number(body.year ?? 2025)
    const netSalary = Number(body.netSalary ?? 150000)

    if (!testEmail) {
      // return withCors(
        ApiResponse.error('Email field is required', 400),
        origin
      )
    }

    // Generate a test ID for the staff (using a fixed test ID)
    const testStaffId = 'test-user-' + Date.now()
    const testPayslipId = 'test-payslip-' + Date.now()

    // Mock staff with required id field
    const mockStaff = {
      id: testStaffId, // Required field
      firstName: 'Test',
      lastName: 'User',
      email: testEmail,
      staffId: 'TEST001',
      department: 'IT',
      position: 'Tester',
      companyId: 'test-company', // Optional but good to include
      isRegistered: true, // Assume registered for testing
    }

    // Mock payroll with required id field (payslip ID)
    const mockPayroll = {
      id: testPayslipId, // Required field - this is the payslip ID
      month,
      year,
      netSalary,
      isUpdate: false,
    }

    const result = await sendPayrollNotificationEmail(mockStaff, mockPayroll)

    if (!result.success) {
      // return withCors(
        ApiResponse.error(
          `Email sending failed: ${result.error || 'Unknown error'}`,
          500
        ),
        origin
      )
    }

    // return withCors(
      ApiResponse.success(
        {
          emailSentTo: testEmail,
          month,
          year,
          netSalary,
          testStaffId,
          testPayslipId,
        },
        'Test email sent successfully (SMTP configuration looks OK)'
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