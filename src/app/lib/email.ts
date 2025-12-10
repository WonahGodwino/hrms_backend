// src/app/lib/email.ts
import nodemailer from 'nodemailer'
import { prisma } from '@/app/lib/db'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
}

export async function sendPayrollNotificationEmail(
  staffRecord: StaffLike,
  payroll: PayrollLike
) {
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

  const netAmount = Number(payroll.netSalary || 0)

  const mailOptions = {
    from: companyFromEmail,
    to: staffRecord.email,
    subject: `Your Payslip for ${payroll.month} ${payroll.year}`,
    html: `
      <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: auto;">
          <div style="background-color: #2c5530; color: white; padding: 20px;">
            <h1 style="margin:0;">${companyName}</h1>
            <h3 style="margin:0;">Payslip Notification</h3>
          </div>

          <div style="padding: 20px; background: #f9f9f9;">
            <p>Hello ${staffRecord.firstName} ${staffRecord.lastName},</p>
            <p>Your payslip for <strong>${payroll.month} ${payroll.year}</strong> is ready.</p>

            <p><strong>Net Salary:</strong> ₦${netAmount.toLocaleString(
              'en-NG',
              { minimumFractionDigits: 2 }
            )}</p>

            <p>Department: ${staffRecord.department || '-'}</p>

            <p style="text-align:center; margin-top:20px;">
              <a href="${loginLink}"
                 style="background:#2c5530;color:white;padding:10px 20px;
                 border-radius:6px;text-decoration:none;">
                View Payslip
              </a>
            </p>

            <p>Best regards,<br>${companyName} HR</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }

  await transporter.sendMail(mailOptions)
}
