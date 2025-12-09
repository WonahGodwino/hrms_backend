// src/app/lib/email.ts
import nodemailer from 'nodemailer'
import { prisma } from '@/app/lib/db'

const host = process.env.SMTP_HOST
const port = Number(process.env.SMTP_PORT || 587)
const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS
const from = process.env.SMTP_FROM || user

if (!host || !port || !user || !pass) {
  console.warn(
    '[EMAIL] SMTP env vars missing. Emails will fail until you set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.'
  )
}

export const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // 465 = SSL, 587 = STARTTLS
  auth: {
    user,
    pass,
  },
  // Turn on debug in Render logs if needed
  // logger: true,
  // debug: true,
})

export async function sendPayrollNotificationEmail(
  staffRecord: any,
  payroll: { month: string; year: number; netSalary: number }
) {
  // Optional: verify connection (you can comment this out after confirming things work)
  // await transporter.verify()

  const company = await prisma.company.findUnique({
    where: { id: staffRecord.companyId },
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const loginLink = `${baseUrl}/profile`

  const mailOptions = {
    from: from || company?.email || 'no-reply@hrms.com',
    to: staffRecord.email,
    subject: `Your Payslip for ${payroll.month} ${payroll.year}`,
    html: `
      <html>
      <body style="font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: auto;">
          <div style="background-color: #2c5530; color: white; padding: 20px;">
            <h1 style="margin:0;">${company?.companyName || 'Your Company'}</h1>
            <h3 style="margin:0;">Payslip Notification</h3>
          </div>

          <div style="padding: 20px; background: #f9f9f9;">
            <p>Hello ${staffRecord.firstName} ${staffRecord.lastName},</p>
            <p>Your payslip for <strong>${payroll.month} ${payroll.year}</strong> is ready.</p>

            <p><strong>Net Salary:</strong> ₦${Number(
              payroll.netSalary ?? payroll['netPay'] ?? 0
            ).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>

            <p>Department: ${staffRecord.department || '-'}</p>

            <p style="text-align:center; margin-top:20px;">
              <a href="${loginLink}"
                 style="background:#2c5530;color:white;padding:10px 20px;
                 border-radius:6px;text-decoration:none;">
                View Payslip
              </a>
            </p>

            <p>Best regards,<br>${company?.companyName || 'HR Team'}</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }

  await transporter.sendMail(mailOptions)
}
