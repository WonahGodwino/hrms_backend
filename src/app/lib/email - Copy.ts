// src/app/lib/email.ts
import nodemailer from 'nodemailer'
import { prisma } from '@/app/lib/db' // Make sure this import exists

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
    connectionTimeout: 100000, // 10 seconds
    greetingTimeout: 100000,   // 10 seconds
    socketTimeout: 100000,     // 15 seconds
    pool: true,               // Use connection pooling
    maxConnections: 20,        // Max connections in pool
    maxMessages: 100,         // Max messages per connection
   logger: true,  // Enable logger for debugging
   debug: true,   // Enable debugging (will log details to console)
   connectionTimeout: 30000, // Increase connection timeout if need
})

type StaffLike = {
  companyId?: string | null
  firstName: string
  lastName: string
  email: string
  staffId?: string
  department?: string | null
  position?: string | null
}

type PayrollLike = {
  month: string
  year: number
  netSalary: number
  isUpdate?: boolean  // Add this optional parameter
}

export async function sendPayrollNotificationEmail(
  staffRecord: StaffLike,
  payroll: PayrollLike
): Promise<{ success: boolean; error?: string }> {
  try {
    // ✅ Safely try to fetch company only if companyId exists
    let companyName = 'Your Company'
    let companyFromEmail =
      process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@hrms.com'

    if (staffRecord.companyId) {
      try {
        const company = await prisma.company.findUnique({
          where: { id: staffRecord.companyId },
        })

        if (company) {
          if (company.companyName) companyName = company.companyName
          if (company.email) companyFromEmail = company.email
        }
      } catch (err) {
        // Log and continue with fallback from address
        console.error('Company lookup failed in sendPayrollNotificationEmail:', err)
      }
    }

    const loginLink =
      process.env.NEXTAUTH_URL ||
      process.env.APP_URL ||
      'http://localhost:3000/profile'

    // Handle both number and decimal types for netSalary
    const netAmount = typeof payroll.netSalary === 'number' 
      ? payroll.netSalary 
      : Number(payroll.netSalary) || 0
    
    // Customize the subject based on isUpdate flag
    const subject = payroll.isUpdate 
      ? `Updated Payslip for ${payroll.month} ${payroll.year}`
      : `Your Payslip for ${payroll.month} ${payroll.year}`

    // Customize the message based on isUpdate flag
    const message = payroll.isUpdate
      ? `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> has been updated.`
      : `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> is ready.`

    const mailOptions = {
      from: companyFromEmail,
      to: staffRecord.email,
      subject: subject,
      html: `
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #2c5530; color: white; padding: 24px 20px; text-align: center;">
              <h1 style="margin: 0 0 10px 0; font-size: 24px;">${companyName}</h1>
              <h3 style="margin: 0; font-size: 18px; font-weight: normal;">Payslip Notification</h3>
            </div>

            <div style="padding: 30px 20px; background: #ffffff;">
              <p style="margin: 0 0 16px 0;">Hello <strong>${staffRecord.firstName} ${staffRecord.lastName}</strong>,</p>
              <p style="margin: 0 0 20px 0;">${message}</p>

              <div style="background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 0 0 20px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Net Salary:</strong> ₦${netAmount.toLocaleString(
                  'en-NG',
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                )}</p>
                
                ${staffRecord.department ? `<p style="margin: 0 0 8px 0;"><strong>Department:</strong> ${staffRecord.department}</p>` : ''}
                
                ${staffRecord.position ? `<p style="margin: 0;"><strong>Position:</strong> ${staffRecord.position}</p>` : ''}
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginLink}"
                   style="display: inline-block; background: #2c5530; color: white; padding: 12px 30px;
                   border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">
                  View Payslip
                </a>
              </div>

              <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">
                  If the button above doesn't work, copy and paste this link into your browser:
                </p>
                <p style="margin: 0; font-size: 14px; color: #2c5530; word-break: break-all;">
                  ${loginLink}
                </p>
              </div>

              <p style="margin: 30px 0 0 0; color: #666; font-size: 14px;">
                Best regards,<br>
                <strong>${companyName} HR Department</strong>
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    }

    await transporter.sendMail(mailOptions)
    return { success: true }
    
  } catch (error: any) {
    console.error('Failed to send payroll notification email:', error)
    return { 
      success: false, 
      error: error.message || 'Unknown error sending email' 
    }
  }
}