// src/app/api/payroll/send-selected-payslips/route.ts
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
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    // Parse request body
    const body = await request.json()
    const { payslipIds, companyId: requestCompanyId } = body

    // Validate input
    if (!payslipIds || !Array.isArray(payslipIds) || payslipIds.length === 0) {
      return withCors(
        ApiResponse.error('Please provide an array of payslip IDs to send emails for', 400),
        origin
      )
    }

    // Determine company ID based on user role
    let companyId: string

    if (user.role === 'HR') {
      if (!user.companyId) {
        return withCors(
          ApiResponse.error('Company context missing for HR user', 400),
          origin
        )
      }
      companyId = user.companyId
    } 
    else if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      if (!requestCompanyId) {
        return withCors(
          ApiResponse.error('Company selection is required for administrators', 400),
          origin
        )
      }
      companyId = requestCompanyId

      // Verify admin has access to this company
      if (user.role === 'ADMIN') {
        const hasAccess = await prisma.userCompany.findFirst({
          where: {
            userId: user.userId,
            companyId: companyId,
            role: { in: ['ADMIN', 'ALL'] }
          }
        })

        if (!hasAccess) {
          return withCors(
            ApiResponse.error('You do not have access to send emails for this company', 403),
            origin
          )
        }
      }
    } else {
      return withCors(
        ApiResponse.error('Unauthorized role', 403),
        origin
      )
    }

    // Verify company exists and is not archived
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        archived: 0
      },
      select: { id: true, companyName: true }
    })

    if (!company) {
      return withCors(
        ApiResponse.error('Company not found or is archived', 404),
        origin
      )
    }

    // FIX: First fetch the payslips with staff information only
    const payslips = await prisma.payslip.findMany({
      where: {
        id: { in: payslipIds },
        companyId: companyId
      },
      include: {
        staffRecord: true
        // REMOVED: payroll include since it's causing issues
      }
    })

    if (payslips.length === 0) {
      return withCors(
        ApiResponse.error('No valid payslips found for the provided IDs', 404),
        origin
      )
    }

    // Check if all requested payslips were found
    if (payslips.length !== payslipIds.length) {
      const foundIds = payslips.map(p => p.id)
      const missingIds = payslipIds.filter(id => !foundIds.includes(id))
      
      return withCors(
        ApiResponse.error(`Some payslips not found or don't belong to your company: ${missingIds.join(', ')}`, 404),
        origin
      )
    }

    // Publish: sending is the HR/Admin approval action, so these payslips
    // become visible to staff as soon as the send is triggered — independent
    // of whether the notification email below actually succeeds per-row.
    await prisma.payslip.updateMany({
      where: { id: { in: payslips.map((p) => p.id) }, companyId },
      data: { draft: false },
    })

    // FIX: Fetch payroll data separately for payslips that have payrollId
    const payrollIds = payslips
      .filter(p => p.payrollId)
      .map(p => p.payrollId);
    
    let payrollsMap = new Map();
    
    if (payrollIds.length > 0) {
      const payrolls = await prisma.payroll.findMany({
        where: {
          id: { in: payrollIds }
        },
        select: {
          id: true,
          netSalary: true,
          createdAt: true
          // Add only fields that exist in your Payroll model
        }
      });
      
      payrollsMap = new Map(payrolls.map(p => [p.id, p]));
    }

    // Month names for display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']

    // Process each payslip email
    const results = {
      total: payslips.length,
      successful: 0,
      failed: 0,
      details: [] as Array<{
        payslipId: string,
        staffName: string,
        staffEmail: string,
        month: string,
        year: number,
        isRegistered: boolean,
        success: boolean,
        error?: string
      }>
    }

    for (const payslip of payslips) {
      const staff = payslip.staffRecord
      const payroll = payslip.payrollId ? payrollsMap.get(payslip.payrollId) : null
      const staffName = `${staff.firstName} ${staff.lastName}`
      
      try {
        // Check if staff has email
        if (!staff.email) {
          throw new Error('Staff member has no email address')
        }

        // Prepare staff object for email function
        const staffForEmail = {
          id: staff.id,
          companyId: staff.companyId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          staffId: staff.staffId,
          department: staff.department,
          position: staff.position,
          isRegistered: staff.isRegistered
        }

        // Prepare payroll object for email - use payslip data primarily
        const payrollForEmail = {
          id: payslip.payrollId || 'unknown',
          month: monthNames[parseInt(payslip.month) - 1] || payslip.month,
          year: payslip.year,
          // Use payslip.netPay first, fallback to payroll?.netSalary, then 0
          netSalary: Number(payslip.netPay || payroll?.netSalary || 0),
          isUpdate: false
        }

        // Check if this might be an update (only if payroll exists)
        if (payroll && payslip.createdAt) {
          payrollForEmail.isUpdate = payslip.createdAt > payroll.createdAt
        }

        // Send the email
        const emailResult = await sendPayrollNotificationEmail(
          staffForEmail,
          payrollForEmail
        )

        if (emailResult.success) {
          results.successful++
          results.details.push({
            payslipId: payslip.id,
            staffName,
            staffEmail: staff.email,
            month: payrollForEmail.month,
            year: payslip.year,
            isRegistered: staffForEmail.isRegistered,
            success: true
          })

          // Log the email sending
          try {
            await prisma.emailLog.create({
              data: {
                companyId,
                staffId: staff.id,
                payrollId: payslip.payrollId, // This can be null, which is fine
                payslipId: payslip.id,
                emailType: 'PAYSLIP_RESEND',
                recipient: staff.email,
                status: 'SENT',
                sentBy: user.userId,
                metadata: {
                  month: payslip.month,
                  year: payslip.year,
                  isUpdate: payrollForEmail.isUpdate,
                  isRegistered: staffForEmail.isRegistered
                }
              }
            })
          } catch (logError) {
            console.error('Failed to log email (non-critical):', logError)
          }

        } else {
          throw new Error(emailResult.error || 'Failed to send email')
        }
      } catch (error: any) {
        results.failed++
        results.details.push({
          payslipId: payslip.id,
          staffName,
          staffEmail: staff.email || 'No email',
          month: monthNames[parseInt(payslip.month) - 1] || payslip.month,
          year: payslip.year,
          isRegistered: staff.isRegistered,
          success: false,
          error: error.message || 'Unknown error'
        })

        // Log the failed attempt
        try {
          await prisma.emailLog.create({
            data: {
              companyId,
              staffId: staff.id,
              payrollId: payslip.payrollId,
              payslipId: payslip.id,
              emailType: 'PAYSLIP_RESEND',
              recipient: staff.email || 'unknown',
              status: 'FAILED',
              sentBy: user.userId,
              error: error.message,
              metadata: {
                month: payslip.month,
                year: payslip.year,
                isRegistered: staff.isRegistered
              }
            }
          })
        } catch (logError) {
          console.error('Failed to log email failure (non-critical):', logError)
        }
      }
    }

    // Prepare response
    const responseData = {
      summary: {
        total: results.total,
        successful: results.successful,
        failed: results.failed,
        successRate: results.total > 0 ? `${((results.successful / results.total) * 100).toFixed(1)}%` : '0%'
      },
      details: results.details,
      companyId: companyId,
      companyName: company.companyName
    }

    console.log('[SEND_SELECTED_EMAILS] Completed', {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      companyId,
      userId: user.userId
    })

    // Return appropriate status based on results
    if (results.failed === 0) {
      return withCors(
        ApiResponse.success(
          responseData,
          `Successfully sent ${results.successful} payslip notification email(s)`
        ),
        origin
      )
    } else if (results.successful > 0) {
      return withCors(
        ApiResponse.success(
          responseData,
          `Sent ${results.successful} email(s), failed for ${results.failed} payslip(s)`
        ),
        origin
      )
    } else {
      return withCors(
        ApiResponse.error(
          `Failed to send any emails. ${results.failed} attempts failed.`,
          500,
          responseData.details
        ),
        origin
      )
    }

  } catch (error) {
    console.error('[SEND_SELECTED_EMAILS] Top-level error:', error)
    return withCors(handleApiError(error), origin)
  }
}