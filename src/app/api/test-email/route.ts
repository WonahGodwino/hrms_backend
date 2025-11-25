import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { requireRole } from '@/app/lib/auth'
import { sendPayrollNotificationEmail } from '@/app/lib/email'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    const body = await req.json()
    const testEmail = body.email

    if (!testEmail) {
      return ApiResponse.error('Email field is required', 400)
    }

    // Dummy staff record
    const mockStaff = {
      firstName: 'Test',
      lastName: 'User',
      email: testEmail,
      staffId: 'TEST001',
      department: 'IT',
    }

    // Dummy payroll payload
    const mockPayroll = {
      month: 'January',
      year: 2025,
      netSalary: 150000,
    }

    // Send using your real function
    await sendPayrollNotificationEmail(mockStaff, mockPayroll)

    return ApiResponse.success(
      {
        emailSentTo: testEmail,
        message: 'SMTP configuration is correct',
      },
      'Test email sent successfully'
    )
  } catch (error) {
    return handleApiError(error)
  }
}
