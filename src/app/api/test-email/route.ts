// src/app/api/test-email/route.ts
import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { sendPayrollNotificationEmail } from '@/app/lib/email'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const body = await req.json().catch(() => ({}))

    const testEmail = body.email as string | undefined
    const month = (body.month as string | undefined) || 'January'
    const year = Number(body.year ?? 2025)
    const netSalary = Number(body.netSalary ?? 150000)

    if (!testEmail) {
      return withCors(
        ApiResponse.error('Email field is required', 400),
        origin
      )
    }

    // No companyId here – that's fine now
    const mockStaff = {
      firstName: 'Test',
      lastName: 'User',
      email: testEmail,
      staffId: 'TEST001',
      department: 'IT',
      position: 'Tester',
    }

    const mockPayroll = {
      month,
      year,
      netSalary,
    }

    await sendPayrollNotificationEmail(mockStaff, mockPayroll)

    return withCors(
      ApiResponse.success(
        {
          emailSentTo: testEmail,
          month,
          year,
          netSalary,
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
