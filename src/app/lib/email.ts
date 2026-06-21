// src/app/lib/email.ts
import formData from 'form-data'
import Mailgun from 'mailgun.js'
import { prisma } from '@/app/lib/db'
import { sign, verify } from 'jsonwebtoken'
import { normalizeCurrencyCode } from '@/app/lib/currency'

// Initialize Mailgun
const mailgun = new Mailgun(formData)
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
})

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ''
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@ms.hr247.co.uk'
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'
const BACKEND_URL = process.env.BACKEND_URL || 'https://hrms.isurfglobal.com'

// ========== NEW: Generic sendEmail function ==========
export async function sendEmail(options: {
  to: string | string[]
  subject: string
  html: string
  text: string
  from?: string
  cc?: string | string[]
  bcc?: string | string[]
}): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    // Validate required environment variables
    if (!process.env.MAILGUN_API_KEY) {
      console.error('❌ MAILGUN_API_KEY is not set')
      return { success: false, error: 'Email service not configured' }
    }

    if (!MAILGUN_DOMAIN) {
      console.error('❌ MAILGUN_DOMAIN is not set')
      return { success: false, error: 'Email domain not configured' }
    }

    if (!FROM_EMAIL) {
      console.error('❌ FROM_EMAIL is not set')
      return { success: false, error: 'Sender email not configured' }
    }

    const mailOptions: any = {
      from: options.from || FROM_EMAIL,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text
    }

    if (options.cc) {
      mailOptions.cc = Array.isArray(options.cc) ? options.cc : [options.cc]
    }

    if (options.bcc) {
      mailOptions.bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc]
    }

    const data = await mg.messages.create(MAILGUN_DOMAIN, mailOptions)
    
    console.log(`✅ Email sent successfully: ${data.id} to ${options.to}`)
    return { success: true, data }
  } catch (error: any) {
    console.error('❌ Failed to send email:', error)
    return { 
      success: false, 
      error: error.message || 'Failed to send email' 
    }
  }
}

// ========== NEW: Leave notification email function ==========
export async function sendLeaveNotificationEmail(
  staff: {
    id: string
    companyId: string
    firstName: string
    lastName: string
    email: string
    staffId: string
    department: string | null
    position: string | null
    isRegistered: boolean
  },
  leaveRequest: {
    id: string
    referenceNumber?: string
    leaveType: string
    startDate: Date
    endDate: Date
    totalDays: number
    status: string
    currentStep: string
  },
  notificationType: 'SUBMITTED' | 'MANAGER_APPROVAL' | 'HR_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get company info
    const company = await prisma.company.findUnique({
      where: { id: staff.companyId },
      select: { companyName: true }
    })

    const companyName = company?.companyName || 'Your Company'
    const frontendUrl = FRONTEND_URL
    
    let subject: string
    let message: string
    let actionText: string
    let detailsHtml = ''

    const formatDate = (date: Date) => new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })

    const daysText = leaveRequest.totalDays === 0.5 
      ? 'Half Day'
      : `${leaveRequest.totalDays} ${leaveRequest.totalDays === 1 ? 'day' : 'days'}`

    switch (notificationType) {
      case 'SUBMITTED':
        subject = `✅ Leave Application Submitted Successfully`
        message = `Your ${leaveRequest.leaveType} leave request has been submitted successfully.`
        actionText = 'View Your Leave Request'
        detailsHtml = `
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p><strong>Reference:</strong> ${leaveRequest.referenceNumber || 'Pending'}</p>
            <p><strong>Dates:</strong> ${formatDate(leaveRequest.startDate)} to ${formatDate(leaveRequest.endDate)}</p>
            <p><strong>Duration:</strong> ${daysText}</p>
            <p><strong>Status:</strong> ${leaveRequest.status}</p>
            <p><strong>Current Step:</strong> ${leaveRequest.currentStep}</p>
          </div>
        `
        break
        
      case 'MANAGER_APPROVAL':
        subject = `📋 New Leave Request Requires Your Approval`
        message = `${staff.firstName} ${staff.lastName} has submitted a ${leaveRequest.leaveType} leave request that requires your approval.`
        actionText = 'Review Leave Request'
        detailsHtml = `
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p><strong>Employee:</strong> ${staff.firstName} ${staff.lastName}</p>
            <p><strong>Leave Type:</strong> ${leaveRequest.leaveType}</p>
            <p><strong>Dates:</strong> ${formatDate(leaveRequest.startDate)} to ${formatDate(leaveRequest.endDate)}</p>
            <p><strong>Duration:</strong> ${daysText}</p>
            <p><strong>Reference:</strong> ${leaveRequest.referenceNumber || 'Pending'}</p>
          </div>
        `
        break
        
      case 'HR_APPROVAL':
        subject = `📋 Leave Request Pending HR Approval`
        message = `A ${leaveRequest.leaveType} leave request from ${staff.firstName} ${staff.lastName} is pending HR approval.`
        actionText = 'Review Leave Request'
        detailsHtml = `
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p><strong>Employee:</strong> ${staff.firstName} ${staff.lastName}</p>
            <p><strong>Leave Type:</strong> ${leaveRequest.leaveType}</p>
            <p><strong>Dates:</strong> ${formatDate(leaveRequest.startDate)} to ${formatDate(leaveRequest.endDate)}</p>
            <p><strong>Duration:</strong> ${daysText}</p>
            <p><strong>Reference:</strong> ${leaveRequest.referenceNumber || 'Pending'}</p>
          </div>
        `
        break
        
      case 'APPROVED':
        subject = `🎉 Your Leave Request Has Been Approved!`
        message = `Your ${leaveRequest.leaveType} leave request has been approved.`
        actionText = 'View Approved Leave'
        detailsHtml = `
          <div style="background-color: #e7f6e7; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p><strong>Reference:</strong> ${leaveRequest.referenceNumber || 'N/A'}</p>
            <p><strong>Dates:</strong> ${formatDate(leaveRequest.startDate)} to ${formatDate(leaveRequest.endDate)}</p>
            <p><strong>Duration:</strong> ${daysText}</p>
            <p><strong>Status:</strong> <span style="color: #2e7d32; font-weight: bold;">APPROVED</span></p>
          </div>
        `
        break
        
      case 'REJECTED':
        subject = `❌ Your Leave Request Has Been Declined`
        message = `Your ${leaveRequest.leaveType} leave request has been declined.`
        actionText = 'View Leave Request Details'
        detailsHtml = `
          <div style="background-color: #ffe6e6; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p><strong>Reference:</strong> ${leaveRequest.referenceNumber || 'N/A'}</p>
            <p><strong>Dates:</strong> ${formatDate(leaveRequest.startDate)} to ${formatDate(leaveRequest.endDate)}</p>
            <p><strong>Duration:</strong> ${daysText}</p>
            <p><strong>Status:</strong> <span style="color: #c62828; font-weight: bold;">REJECTED</span></p>
          </div>
        `
        break
        
      case 'CANCELLED':
        subject = `🚫 Your Leave Request Has Been Cancelled`
        message = `Your ${leaveRequest.leaveType} leave request has been cancelled.`
        actionText = 'View Leave Request Details'
        detailsHtml = `
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p><strong>Reference:</strong> ${leaveRequest.referenceNumber || 'N/A'}</p>
            <p><strong>Dates:</strong> ${formatDate(leaveRequest.startDate)} to ${formatDate(leaveRequest.endDate)}</p>
            <p><strong>Duration:</strong> ${daysText}</p>
            <p><strong>Status:</strong> <span style="color: #856404; font-weight: bold;">CANCELLED</span></p>
          </div>
        `
        break
    }

    const loginUrl = `${frontendUrl}/login?email=${encodeURIComponent(staff.email)}&redirect=/leave/requests/${leaveRequest.id}`
    
    // HTML email template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #2c5530;
            padding-bottom: 20px;
          }
          .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #2c5530;
            margin-bottom: 10px;
          }
          .subject {
            font-size: 18px;
            color: #666;
          }
          .content {
            margin-bottom: 30px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #2c5530;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="company-name">${companyName}</div>
            <div class="subject">${subject}</div>
          </div>
          
          <div class="content">
            <p>Dear ${staff.firstName} ${staff.lastName},</p>
            
            <p>${message}</p>
            
            ${detailsHtml}
            
            <div style="text-align: center;">
              <a href="${loginUrl}" class="button">
                ${actionText}
              </a>
            </div>
            
            <div style="margin-top: 20px;">
              <p>Best regards,<br>
              <strong>${companyName} HR Team</strong></p>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated message from ${companyName}. Please do not reply to this email.</p>
            <p>If you have any questions, please contact your HR department.</p>
          </div>
        </div>
      </body>
      </html>
    `

    // Plain text version
    const textContent = `Dear ${staff.firstName} ${staff.lastName},

${message}

Reference: ${leaveRequest.referenceNumber || 'Pending'}
Dates: ${formatDate(leaveRequest.startDate)} to ${formatDate(leaveRequest.endDate)}
Duration: ${daysText}
Status: ${leaveRequest.status}
Current Step: ${leaveRequest.currentStep}

To view details, please click: ${loginUrl}

Best regards,
${companyName} HR Team

This is an automated message. Please do not reply to this email.
If you have any questions, please contact your HR department.`

    // Send email
    const result = await sendEmail({
      to: staff.email,
      subject: subject,
      html: htmlContent,
      text: textContent,
      from: `${companyName} HR <${FROM_EMAIL}>`
    })

    return result
  } catch (error: any) {
    console.error(`Error sending ${notificationType} notification email:`, error)
    return { 
      success: false, 
      error: error.message || 'Failed to send email' 
    }
  }
}

// ========== EXISTING FUNCTIONS (Maintained for backward compatibility) ==========

export async function sendPayrollNotificationEmail(
  staff: {
    id: string
    companyId: string
    firstName: string
    lastName: string
    email: string
    staffId: string
    department: string | null
    position: string | null
    isRegistered: boolean
  },
  payroll: {
    id: string
    month: string
    year: number
    netSalary: number
    isUpdate: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate required environment variables
    if (!process.env.MAILGUN_API_KEY) {
      console.error('❌ MAILGUN_API_KEY is not set')
      return { success: false, error: 'Email service not configured' }
    }

    if (!MAILGUN_DOMAIN) {
      console.error('❌ MAILGUN_DOMAIN is not set')
      return { success: false, error: 'Email domain not configured' }
    }

    if (!FROM_EMAIL) {
      console.error('❌ FROM_EMAIL is not set')
      return { success: false, error: 'Sender email not configured' }
    }

    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET is not set')
      return { success: false, error: 'JWT secret not configured' }
    }

    console.log(`📧 Attempting to send payroll email to ${staff.email}`)
    console.log(`📧 Using domain: ${MAILGUN_DOMAIN}, from: ${FROM_EMAIL}`)

    // Fetch company name from database
    let companyName = 'Your Company' // Default fallback
    let companyBaseCurrency = 'NGN'
    
    try {
      const company = await prisma.company.findUnique({
        where: { id: staff.companyId },
        select: { companyName: true, baseCurrency: true as any }
      })
      
      if (company) {
        companyName = company.companyName
        companyBaseCurrency = normalizeCurrencyCode((company as any).baseCurrency || 'NGN')
      } else {
        console.warn(`⚠️ Company not found for ID: ${staff.companyId}, using default name`)
      }
    } catch (dbError) {
      console.error('❌ Failed to fetch company name from database:', dbError)
      // Continue with default name
    }

    // Generate access token - INCLUDING companyId
    const jwtSecret = process.env.JWT_SECRET
    const accessToken = sign(
      {
        purpose: 'payslip_access',
        sub: staff.id,
        email: staff.email,
        staffId: staff.staffId,
        companyId: staff.companyId, // ADDED: Company ID for compound unique lookup
        payslipId: payroll.id,
        isRegistered: staff.isRegistered,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days expiry
      },
      jwtSecret
    )

    // === CRITICAL FIX: Use separate URLs for frontend and backend ===
    // Frontend URL - where your React app runs (for login/registration pages)
    const frontendUrl = FRONTEND_URL
    // Backend URL - where your API/HRMS runs (for API endpoints)
    const backendUrl = BACKEND_URL
    
    let accessUrl = ''
    let callToAction = ''

    console.log(`🌐 Frontend URL: ${frontendUrl}, Backend URL: ${backendUrl}`)

    if (staff.isRegistered) {
      // For registered users: Login page on FRONTEND
      if (payroll.id) {
        accessUrl = `${frontendUrl}/login?email=${encodeURIComponent(staff.email)}&redirect=/profile/payslips/${payroll.id}`
      } else {
        accessUrl = `${frontendUrl}/login?email=${encodeURIComponent(staff.email)}`
      }
      callToAction = 'Login to view your payslip'
      console.log(`✅ Registered user URL (frontend): ${accessUrl}`)
    } else {
      // For unregistered users: API endpoint on BACKEND
      accessUrl = `${backendUrl}/api/auth/payslip-access?token=${accessToken}`
      callToAction = 'Complete your registration to access your payslip'
      console.log(`✅ Unregistered user URL (backend API): ${accessUrl}`)
    }

    const subject = payroll.isUpdate 
      ? `📄 Updated Payslip for ${payroll.month} ${payroll.year}`
      : `📄 New Payslip for ${payroll.month} ${payroll.year}`

    const greeting = `Dear ${staff.firstName} ${staff.lastName},`

    const formattedNetSalary = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: companyBaseCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(payroll.netSalary || 0))

    const message = payroll.isUpdate
      ? `Your payslip for ${payroll.month} ${payroll.year} has been updated. Your net salary is ${formattedNetSalary}.`
      : `Your payslip for ${payroll.month} ${payroll.year} is now available. Your net salary is ${formattedNetSalary}.`

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #2c5530;
            padding-bottom: 20px;
          }
          .company-name {
            font-size: 24px;
            font-weight: bold;
            color: #2c5530;
            margin-bottom: 10px;
          }
          .subject {
            font-size: 18px;
            color: #666;
          }
          .content {
            margin-bottom: 30px;
          }
          .salary-amount {
            font-size: 24px;
            font-weight: bold;
            color: #2c5530;
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 6px;
            border: 1px solid #dee2e6;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #2c5530;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
          }
          .secondary-button {
            display: inline-block;
            padding: 10px 20px;
            background-color: #6c757d;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            text-align: center;
            margin: 10px 5px;
            font-size: 14px;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #666;
            font-size: 12px;
          }
          .warning {
            background-color: #fff3cd;
            border: 1px solid #ffc107;
            color: #856404;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            font-size: 14px;
          }
          .info-box {
            background-color: #e7f3ff;
            border: 1px solid #b6d4fe;
            color: #084298;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            font-size: 14px
          }
          .link-box {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
            word-break: break-all;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="company-name">${companyName}</div>
            <div class="subject">${subject}</div>
          </div>
          
          <div class="content">
            <p>${greeting}</p>
            
            <p>${message}</p>
            
            <div class="salary-amount">
              ${formattedNetSalary}
            </div>
            
            <div class="info-box">
              <strong>💰 Your Net Salary:</strong> ${formattedNetSalary}
            </div>
            
            <div style="text-align: center;">
              <a href="${accessUrl}" class="button">
                ${callToAction}
              </a>
            </div>
            
            ${!staff.isRegistered ? `
              <div class="warning">
                <strong>⚠️ Important Notice:</strong><br>
                You need to complete your registration to access your payslip. 
                Your Staff ID is: <strong>${staff.staffId}</strong><br>
                Your Email: <strong>${staff.email}</strong>
              </div>
              
              <div class="link-box">
                <strong>Registration Link:</strong><br>
                <a href="${accessUrl}">Click here to complete registration and view your payslip</a><br>
                <small>Or copy this link: ${accessUrl}</small>
              </div>
            ` : `
              <div style="text-align: center; margin-top: 15px;">
                <p>Already have an account? Click below to login:</p>
                <a href="${frontendUrl}/login?email=${encodeURIComponent(staff.email)}${payroll.id ? `&redirect=/profile/payslips/${payroll.id}` : ''}" class="secondary-button">
                  Login with your registered account
                </a>
              </div>
            `}
            
            <p>You can also view your payslip history by logging into your account.</p>
            
            <div style="margin-top: 20px; font-size: 12px; color: #666; text-align: center;">
              <p><em>Note: This link will expire in 7 days for security purposes.</em></p>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated message from ${companyName}. Please do not reply to this email.</p>
            <p>If you have any questions, please contact your HR department.</p>
          </div>
        </div>
      </body>
      </html>
    `

    // Plain text version
    const textContent = `${greeting}

${message}

Your net salary: ${formattedNetSalary}

${staff.isRegistered ? 
`To view your payslip, please login to your account:
${frontendUrl}/login?email=${encodeURIComponent(staff.email)}${payroll.id ? `&redirect=/profile/payslips/${payroll.id}` : ''}

Your email address: ${staff.email}` : 
`To access your payslip, you need to complete your registration:

Access Link: ${accessUrl}

Your Staff ID: ${staff.staffId}
Your Email: ${staff.email}

Click the link above to complete registration and view your payslip.

This link will expire in 7 days for security purposes.`}

This is an automated message from ${companyName}. Please do not reply to this email.
If you have any questions, please contact your HR department.`

    // Send email using Mailgun (using the new sendEmail function)
    const result = await sendEmail({
      to: staff.email,
      subject: subject,
      html: htmlContent,
      text: textContent,
      from: `${companyName} <${FROM_EMAIL}>`
    })

    if (result.success) {
      console.log(`✅ Payroll notification email sent to ${staff.email} from ${companyName}`)
      console.log(`🔗 Access URL: ${accessUrl}`)
      console.log(`👤 User registration status: ${staff.isRegistered ? 'Registered' : 'Unregistered'}`)
    } else {
      console.error(`❌ Failed to send payroll email: ${result.error}`)
    }
    
    return result
  } catch (error: any) {
    console.error('❌ Failed to send payroll notification email:', error)
    
    // Log more details about the error
    if (error.status === 404) {
      console.error('🔍 Mailgun 404 Error Details:', {
        domain: MAILGUN_DOMAIN,
        fromEmail: FROM_EMAIL,
        apiKeyExists: !!process.env.MAILGUN_API_KEY,
        apiKeyLength: process.env.MAILGUN_API_KEY?.length,
        apiKeyPreview: process.env.MAILGUN_API_KEY ? `${process.env.MAILGUN_API_KEY.substring(0, 10)}...` : 'Not set'
      })
    }
    
    return { 
      success: false, 
      error: error.message || 'Failed to send email' 
    }
  }
}

// ========== EXISTING HELPER FUNCTIONS (Maintained) ==========

// Function to generate a payslip access token (for external use if needed)
export function generatePayslipAccessToken(staff: {
  id: string
  email: string
  staffId: string
  companyId: string // ADDED: Company ID parameter
  isRegistered: boolean
}, payslipId: string): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured')
  }

  return sign(
    {
      purpose: 'payslip_access',
      sub: staff.id,
      email: staff.email,
      staffId: staff.staffId,
      companyId: staff.companyId, // ADDED: Company ID
      payslipId: payslipId,
      isRegistered: staff.isRegistered,
      exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days expiry
    },
    process.env.JWT_SECRET
  )
}

// Function to verify payslip access token (for external use if needed)
export function verifyPayslipAccessToken(token: string): any {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured')
  }

  const { verify } = require('jsonwebtoken')
  return verify(token, process.env.JWT_SECRET)
}

// Test email function for debugging
export async function testEmailConfig(companyId?: string): Promise<{ success: boolean; message: string; details?: any }> {
  try {
    if (!process.env.MAILGUN_API_KEY) {
      return { 
        success: false, 
        message: 'MAILGUN_API_KEY is not set in environment variables' 
      }
    }

    if (!MAILGUN_DOMAIN) {
      return { 
        success: false, 
        message: 'MAILGUN_DOMAIN is not set in environment variables' 
      }
    }

    if (!FROM_EMAIL) {
      return { 
        success: false, 
        message: 'FROM_EMAIL is not set in environment variables' 
      }
    }

    if (!process.env.JWT_SECRET) {
      return { 
        success: false, 
        message: 'JWT_SECRET is not set in environment variables' 
      }
    }

    // Get company name if companyId is provided
    let companyName = 'Test Company'
    let fromName = 'Test'
    
    if (companyId) {
      try {
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { companyName: true }
        })
        
        if (company) {
          companyName = company.companyName
          fromName = companyName
        }
      } catch (dbError) {
        console.error('❌ Failed to fetch company name:', dbError)
      }
    }

    // Generate a test token WITH companyId
    const testToken = sign(
      {
        purpose: 'payslip_access_test',
        sub: 'test-user-id',
        email: FROM_EMAIL,
        staffId: 'TEST001',
        companyId: companyId || 'test-company-id', // ADDED: Company ID
        isRegistered: false,
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 1 day expiry
      },
      process.env.JWT_SECRET
    )

    // Use separate URLs for testing
    const frontendUrl = FRONTEND_URL
    const backendUrl = BACKEND_URL
    
    // Unregistered user should go to backend API
    const testAccessUrl = `${backendUrl}/api/auth/payslip-access?token=${testToken}`

    // Test the Mailgun client using sendEmail function
    const result = await sendEmail({
      to: FROM_EMAIL, // Send to yourself for testing
      subject: 'Test Email Configuration - Payslip Access',
      html: `
        <h1>Test Email Configuration</h1>
        <p>This is a test email to verify your Mailgun configuration.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p><strong>Company:</strong> ${companyName}</p>
          <p><strong>Company ID:</strong> ${companyId || 'test-company-id'}</p>
          <p><strong>Test Token Generated:</strong> Yes (${testToken.substring(0, 20)}...)</p>
          <p><strong>Test Access URL:</strong> <a href="${testAccessUrl}">${testAccessUrl}</a></p>
          <p><strong>Frontend URL:</strong> ${frontendUrl}</p>
          <p><strong>Backend URL:</strong> ${backendUrl}</p>
          <p><em>This link will redirect unregistered users to the registration page.</em></p>
          <p><strong>JWT_SECRET configured:</strong> ${process.env.JWT_SECRET ? 'Yes' : 'No'}</p>
        </div>
      `,
      text: `This is a test email to verify your Mailgun configuration.

Company: ${companyName}
Company ID: ${companyId || 'test-company-id'}

Test Token Generated: Yes (${testToken.substring(0, 20)}...)
Test Access URL: ${testAccessUrl}

Frontend URL: ${frontendUrl}
Backend URL: ${backendUrl}

This link will redirect unregistered users to the registration page.

JWT_SECRET configured: ${process.env.JWT_SECRET ? 'Yes' : 'No'}`
    })

    if (result.success) {
      return { 
        success: true, 
        message: 'Email configuration test successful',
        details: { 
          companyName,
          companyId: companyId || 'test-company-id',
          domain: MAILGUN_DOMAIN,
          tokenPreview: testToken.substring(0, 20) + '...',
          accessUrl: testAccessUrl,
          frontendUrl,
          backendUrl
        }
      }
    } else {
      return { 
        success: false, 
        message: `Email configuration test failed: ${result.error}`,
        details: result.error
      }
    }
  } catch (error: any) {
    console.error('❌ Email configuration test failed:', error)
    return { 
      success: false, 
      message: `Email configuration test failed: ${error.message}`,
      details: error
    }
  }
}

// ========== NEW HELPER FUNCTIONS ==========

// Helper function to send simple email notifications
export async function sendSimpleNotificationEmail(
  to: string | string[],
  subject: string,
  message: string,
  companyName?: string
): Promise<{ success: boolean; error?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #2c5530; }
        .company-name { font-size: 24px; font-weight: bold; color: #2c5530; }
        .content { padding: 20px 0; }
        .footer { text-align: center; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        ${companyName ? `<div class="header"><div class="company-name">${companyName}</div></div>` : ''}
        <div class="content">
          <p>${message.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="footer">
          <p>This is an automated message${companyName ? ` from ${companyName}` : ''}.</p>
        </div>
      </div>
    </body>
    </html>
  `

  const textContent = message

  return await sendEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
    from: companyName ? `${companyName} <${FROM_EMAIL}>` : FROM_EMAIL
  })
}

// ========== GUARANTOR WORKFLOW ==========

export function generateGuarantorToken(
  loanRequestId: string,
  guarantorStaffId: string
): { token: string; expiry: Date } {
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const token = sign(
    { purpose: 'guarantor_response', loanRequestId, guarantorStaffId },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  )
  return { token, expiry }
}

export function verifyGuarantorToken(token: string): {
  loanRequestId: string
  guarantorStaffId: string
} | null {
  try {
    const decoded = verify(token, process.env.JWT_SECRET || 'secret') as any
    if (decoded?.purpose !== 'guarantor_response') return null
    return { loanRequestId: decoded.loanRequestId, guarantorStaffId: decoded.guarantorStaffId }
  } catch {
    return null
  }
}

export async function sendGuarantorRequestEmail(params: {
  guarantorEmail: string
  guarantorName: string
  applicantName: string
  loanType: string
  amount: number
  tenureMonths: number
  monthlyRepayment: number
  purpose: string
  token: string
  currency?: string
}): Promise<{ success: boolean; error?: string }> {
  const {
    guarantorEmail, guarantorName, applicantName, loanType,
    amount, tenureMonths, monthlyRepayment, purpose, token, currency = 'NGN',
  } = params
  const responseLink = `${FRONTEND_URL}/guarantor-response?token=${token}`
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guarantor Request</title>
  <style>
    body{margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;color:#e2e8f0}
    .wrapper{max-width:600px;margin:0 auto;padding:24px 16px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden}
    .header{background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px;text-align:center}
    .header h1{margin:0;font-size:22px;font-weight:700;color:#fff}
    .header p{margin:8px 0 0;font-size:14px;color:rgba(255,255,255,.85)}
    .body{padding:32px}
    .greeting{font-size:16px;color:#cbd5e1;margin-bottom:16px}
    .intro{font-size:15px;color:#94a3b8;line-height:1.6;margin-bottom:24px}
    .loan-box{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:24px}
    .loan-box h3{margin:0 0 16px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
    .row{display:flex;justify-content:space-between;margin-bottom:12px}
    .row:last-child{margin-bottom:0}
    .lbl{font-size:13px;color:#64748b}
    .val{font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;max-width:60%}
    .amt{font-size:20px;font-weight:700;color:#f59e0b}
    .info{background:#172033;border:1px solid #1e3a5f;border-radius:10px;padding:16px 20px;margin-bottom:24px}
    .info p{margin:0;font-size:13px;color:#7dd3fc;line-height:1.6}
    .btns{display:flex;gap:12px;margin-bottom:20px}
    .btn{display:inline-block;padding:14px 20px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;text-align:center;flex:1}
    .btn-accept{background:linear-gradient(135deg,#10b981,#059669);color:#fff}
    .btn-decline{background:#1e293b;border:2px solid #ef4444;color:#ef4444}
    .link-note{font-size:12px;color:#475569;line-height:1.6;word-break:break-all;margin-bottom:8px}
    .expiry{font-size:12px;color:#64748b}
    .footer{padding:20px 32px;border-top:1px solid #334155;text-align:center}
    .footer p{margin:0;font-size:12px;color:#475569}
  </style>
</head>
<body>
  <div class="wrapper"><div class="card">
    <div class="header">
      <h1>247HR — Guarantor Request</h1>
      <p>You have been requested to guarantee a loan application</p>
    </div>
    <div class="body">
      <p class="greeting">Dear <strong>${guarantorName}</strong>,</p>
      <p class="intro">
        <strong style="color:#e2e8f0">${applicantName}</strong> has submitted a loan application and selected
        you as their guarantor. As a guarantor, you are consenting to support this application.
        Please review the details below and respond before the loan can be processed for approval.
      </p>
      <div class="loan-box">
        <h3>Loan Details</h3>
        <div class="row"><span class="lbl">Applicant</span><span class="val">${applicantName}</span></div>
        <div class="row"><span class="lbl">Loan Type</span><span class="val">${loanType}</span></div>
        <div class="row"><span class="lbl">Amount Requested</span><span class="val amt">${currency} ${fmt(amount)}</span></div>
        <div class="row"><span class="lbl">Repayment Period</span><span class="val">${tenureMonths} Month${tenureMonths !== 1 ? 's' : ''}</span></div>
        <div class="row"><span class="lbl">Monthly Deduction</span><span class="val">${currency} ${fmt(monthlyRepayment)}</span></div>
        ${purpose ? `<div class="row"><span class="lbl">Purpose</span><span class="val" style="color:#94a3b8">${purpose}</span></div>` : ''}
      </div>
      <div class="info">
        <p>ℹ️ By accepting, you confirm willingness to act as guarantor. This loan will not be processed until you respond. If you decline, the applicant will be notified to update their application.</p>
      </div>
      <div class="btns">
        <a href="${responseLink}&decision=ACCEPT" class="btn btn-accept">✓ Accept as Guarantor</a>
        <a href="${responseLink}&decision=DECLINE" class="btn btn-decline">✗ Decline</a>
      </div>
      <p class="link-note">Or open the response page directly:<br>${responseLink}</p>
      <p class="expiry">⏱ This link expires in 7 days.</p>
    </div>
    <div class="footer"><p>Automated message from 247HR. Do not reply to this email.</p></div>
  </div></div>
</body>
</html>`

  const text = `Guarantor Request\n\nDear ${guarantorName},\n\n${applicantName} has requested you as guarantor for a ${loanType} of ${currency} ${fmt(amount)} over ${tenureMonths} months (${currency} ${fmt(monthlyRepayment)}/month).\n\nRespond here: ${responseLink}\n\nThis link expires in 7 days.\n\n247HR`

  return sendEmail({
    to: guarantorEmail,
    subject: `Guarantor Request: ${applicantName} — ${loanType} (${currency} ${fmt(amount)})`,
    html,
    text,
  })
}

export async function sendGuarantorResponseEmail(params: {
  applicantEmail: string
  applicantName: string
  guarantorName: string
  loanType: string
  amount: number
  decision: 'ACCEPTED' | 'DECLINED'
  declineReason?: string
  currency?: string
}): Promise<{ success: boolean; error?: string }> {
  const { applicantEmail, applicantName, guarantorName, loanType, amount, decision, declineReason, currency = 'NGN' } = params
  const isAccepted = decision === 'ACCEPTED'
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const accent = isAccepted ? '#10b981' : '#ef4444'
  const loginLink = `${FRONTEND_URL}/login`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guarantor ${isAccepted ? 'Accepted' : 'Declined'}</title>
  <style>
    body{margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#0f172a;color:#e2e8f0}
    .wrapper{max-width:600px;margin:0 auto;padding:24px 16px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden}
    .header{background:linear-gradient(135deg,${accent},${isAccepted ? '#059669' : '#dc2626'});padding:32px;text-align:center}
    .header h1{margin:0;font-size:22px;font-weight:700;color:#fff}
    .header p{margin:8px 0 0;font-size:14px;color:rgba(255,255,255,.85)}
    .body{padding:32px}
    .badge{display:inline-block;padding:8px 20px;border-radius:50px;font-size:14px;font-weight:700;color:${accent};background:${accent}20;border:1px solid ${accent}50;margin-bottom:20px}
    .info{background:${isAccepted ? '#0d2d1f' : '#2d0d0d'};border:1px solid ${accent}40;border-radius:10px;padding:16px 20px;margin-bottom:20px}
    .info p{margin:0;font-size:14px;color:${isAccepted ? '#6ee7b7' : '#fca5a5'};line-height:1.6}
    .reason{background:#0f172a;border:1px solid #475569;border-radius:10px;padding:14px 18px;margin-top:12px}
    .reason .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px}
    .reason p{margin:0;font-size:13px;color:#94a3b8}
    .btn{display:inline-block;padding:12px 28px;background:#f59e0b;color:#0f172a;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;margin-top:16px}
    .footer{padding:20px 32px;border-top:1px solid #334155;text-align:center}
    .footer p{margin:0;font-size:12px;color:#475569}
  </style>
</head>
<body>
  <div class="wrapper"><div class="card">
    <div class="header">
      <h1>${isAccepted ? '✅' : '❌'} Guarantor ${isAccepted ? 'Accepted' : 'Declined'}</h1>
      <p>Update on your ${loanType} application</p>
    </div>
    <div class="body">
      <p style="font-size:16px;color:#cbd5e1;margin-bottom:16px">Dear <strong>${applicantName}</strong>,</p>
      <span class="badge">${isAccepted ? '✅' : '❌'} ${guarantorName} has ${isAccepted ? 'accepted' : 'declined'} your guarantor request</span>
      <div class="info">
        ${isAccepted
          ? `<p><strong>${guarantorName}</strong> has accepted to guarantee your <strong>${loanType}</strong> of <strong>${currency} ${fmt(amount)}</strong>. Your application will now be reviewed by HR/Admin for approval. You will be notified once a decision is made.</p>`
          : `<p><strong>${guarantorName}</strong> has declined to guarantee your <strong>${loanType}</strong> of <strong>${currency} ${fmt(amount)}</strong>. Please log in to update your guarantor and resubmit your application, or contact HR for assistance.</p>`
        }
      </div>
      ${!isAccepted && declineReason ? `<div class="reason"><div class="lbl">Reason Provided</div><p>${declineReason}</p></div>` : ''}
      <a href="${loginLink}" class="btn">${isAccepted ? 'View My Applications →' : 'Update & Resubmit →'}</a>
    </div>
    <div class="footer"><p>Automated message from 247HR. Do not reply to this email.</p></div>
  </div></div>
</body>
</html>`

  const text = isAccepted
    ? `Guarantor Accepted\n\nDear ${applicantName},\n\n${guarantorName} has accepted your guarantor request for a ${loanType} of ${currency} ${fmt(amount)}.\n\nYour application will now proceed to HR/Admin for review.\n\nLog in: ${loginLink}\n\n247HR`
    : `Guarantor Declined\n\nDear ${applicantName},\n\n${guarantorName} has declined your guarantor request for a ${loanType} of ${currency} ${fmt(amount)}.\n\n${declineReason ? `Reason: ${declineReason}\n\n` : ''}Please log in to update your guarantor and resubmit.\n\nLog in: ${loginLink}\n\n247HR`

  return sendEmail({
    to: applicantEmail,
    subject: `Guarantor ${isAccepted ? 'Accepted' : 'Declined'}: ${guarantorName} — ${loanType} Application`,
    html,
    text,
  })
}