// src/app/lib/email.ts
import formData from 'form-data'
import Mailgun from 'mailgun.js'
import { prisma } from '@/app/lib/db'
import { sign } from 'jsonwebtoken'

// Initialize Mailgun
const mailgun = new Mailgun(formData)
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
})

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ''
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@yourdomain.com'

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
    
    try {
      const company = await prisma.company.findUnique({
        where: { id: staff.companyId },
        select: { companyName: true }
      })
      
      if (company) {
        companyName = company.companyName
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

    // Create access URL based on registration status
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.isurfglobal.com'
    let accessUrl = ''
    let callToAction = ''

    // === UPDATED SECTION ===
    if (staff.isRegistered) {
      // For registered users: Login page with pre-filled email
      // Add redirect to specific payslip if available
      if (payroll.id) {
        accessUrl = `${appUrl}/login?email=${encodeURIComponent(staff.email)}&redirect=/profile/payslips/${payroll.id}`
      } else {
        accessUrl = `${appUrl}/login?email=${encodeURIComponent(staff.email)}`
      }
      callToAction = 'Login to view your payslip'
    } else {
      // For unregistered users: ALWAYS use the payslip-access endpoint
      // This will handle the redirection to /complete-registration
      accessUrl = `${appUrl}/api/auth/payslip-access?token=${accessToken}`
      callToAction = 'Complete your registration to access your payslip'
    }
    // === END UPDATED SECTION ===

    const subject = payroll.isUpdate 
      ? `📄 Updated Payslip for ${payroll.month} ${payroll.year}`
      : `📄 New Payslip for ${payroll.month} ${payroll.year}`

    const greeting = `Dear ${staff.firstName} ${staff.lastName},`

    const message = payroll.isUpdate
      ? `Your payslip for ${payroll.month} ${payroll.year} has been updated. Your net salary is ₦${payroll.netSalary.toLocaleString('en-NG')}.`
      : `Your payslip for ${payroll.month} ${payroll.year} is now available. Your net salary is ₦${payroll.netSalary.toLocaleString('en-NG')}.`

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
            font-size: 14px;
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
              ₦${payroll.netSalary.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </div>
            
            <div class="info-box">
              <strong>💰 Your Net Salary:</strong> ₦${payroll.netSalary.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </div>
            
            <div style="text-align: center;">
              <a href="${accessUrl}" class="button">
                ${callToAction}
              </a>
            </div>
            
            <!-- UPDATED SECTION -->
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
                <a href="${appUrl}/login?email=${encodeURIComponent(staff.email)}${payroll.id ? `&redirect=/profile/payslips/${payroll.id}` : ''}" class="secondary-button">
                  Login with your registered account
                </a>
              </div>
            `}
            <!-- END UPDATED SECTION -->
            
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

Your net salary: ₦${payroll.netSalary.toLocaleString('en-NG', { minimumFractionDigits: 2 })}

${staff.isRegistered ? 
`To view your payslip, please login to your account:
${appUrl}/login?email=${encodeURIComponent(staff.email)}${payroll.id ? `&redirect=/profile/payslips/${payroll.id}` : ''}

Your email address: ${staff.email}` : 
`To access your payslip, you need to complete your registration:

Access Link: ${accessUrl}

Your Staff ID: ${staff.staffId}
Your Email: ${staff.email}

Click the link above to complete registration and view your payslip.

This link will expire in 7 days for security purposes.`}

This is an automated message from ${companyName}. Please do not reply to this email.
If you have any questions, please contact your HR department.`

    // Send email using Mailgun
    const data = await mg.messages.create(MAILGUN_DOMAIN, {
      from: `${companyName} <${FROM_EMAIL}>`,
      to: [staff.email],
      subject: subject,
      html: htmlContent,
      text: textContent
    })

    console.log(`✅ Payroll notification email sent to ${staff.email} from ${companyName}: ${data.id}`)
    console.log(`🔗 Access URL: ${accessUrl}`)
    console.log(`👤 User registration status: ${staff.isRegistered ? 'Registered' : 'Unregistered'}`)
    
    return { success: true }
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    // Use the payslip-access endpoint for consistency
    const testAccessUrl = `${appUrl}/api/auth/payslip-access?token=${testToken}`

    // Test the Mailgun client
    const testData = await mg.messages.create(MAILGUN_DOMAIN, {
      from: `${fromName} <${FROM_EMAIL}>`,
      to: [FROM_EMAIL], // Send to yourself for testing
      subject: 'Test Email Configuration - Payslip Access',
      text: `This is a test email to verify your Mailgun configuration.

Company: ${companyName}
Company ID: ${companyId || 'test-company-id'}

Test Token Generated: Yes (${testToken.substring(0, 20)}...)
Test Access URL: ${testAccessUrl}

This link will redirect unregistered users to the registration page.

JWT_SECRET configured: ${process.env.JWT_SECRET ? 'Yes' : 'No'}
NEXT_PUBLIC_APP_URL: ${appUrl}`,
      html: `
        <h1>Test Email Configuration</h1>
        <p>This is a test email to verify your Mailgun configuration.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p><strong>Company:</strong> ${companyName}</p>
          <p><strong>Company ID:</strong> ${companyId || 'test-company-id'}</p>
          <p><strong>Test Token Generated:</strong> Yes (${testToken.substring(0, 20)}...)</p>
          <p><strong>Test Access URL:</strong> <a href="${testAccessUrl}">${testAccessUrl}</a></p>
          <p><em>This link will redirect unregistered users to the registration page.</em></p>
          <p><strong>JWT_SECRET configured:</strong> ${process.env.JWT_SECRET ? 'Yes' : 'No'}</p>
          <p><strong>NEXT_PUBLIC_APP_URL:</strong> ${appUrl}</p>
        </div>
      `
    })

    return { 
      success: true, 
      message: 'Email configuration test successful',
      details: { 
        messageId: testData.id,
        companyName,
        companyId: companyId || 'test-company-id',
        domain: MAILGUN_DOMAIN,
        tokenPreview: testToken.substring(0, 20) + '...',
        accessUrl: testAccessUrl
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