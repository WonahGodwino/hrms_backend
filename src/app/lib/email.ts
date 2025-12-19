// src/app/lib/email.ts
import formData from 'form-data'
import Mailgun from 'mailgun.js'

// Initialize Mailgun
const mailgun = new Mailgun(formData)
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
})

const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || ''
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@yourdomain.com'
const COMPANY_NAME = process.env.COMPANY_NAME || 'Your Company'

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

    console.log(`📧 Attempting to send payroll email to ${staff.email}`)
    console.log(`📧 Using domain: ${MAILGUN_DOMAIN}, from: ${FROM_EMAIL}`)

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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="company-name">${COMPANY_NAME}</div>
            <div class="subject">${subject}</div>
          </div>
          
          <div class="content">
            <p>${greeting}</p>
            
            <p>${message}</p>
            
            <div class="salary-amount">
              ₦${payroll.netSalary.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </div>
            
            <div style="text-align: center;">
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/api/payslips/${payroll.id}/download" class="button">
                Download Your Payslip
              </a>
            </div>
            
            <p>You can also view your payslip history by logging into your account.</p>
            
            ${!staff.isRegistered ? `
              <div class="warning">
                <strong>⚠️ Important Notice:</strong><br>
                You need to complete your registration to access the payslip portal.
                Please visit ${process.env.APP_URL || 'http://localhost:3000'} to complete your registration.
              </div>
            ` : ''}
          </div>
          
          <div class="footer">
            <p>This is an automated message from ${COMPANY_NAME}. Please do not reply to this email.</p>
            <p>If you have any questions, please contact your HR department.</p>
          </div>
        </div>
      </body>
      </html>
    `

    // Send email using Mailgun
    const data = await mg.messages.create(MAILGUN_DOMAIN, {
      from: `${COMPANY_NAME} <${FROM_EMAIL}>`,
      to: [staff.email],
      subject: subject,
      html: htmlContent,
      text: `${greeting}\n\n${message}\n\nYour net salary: ₦${payroll.netSalary.toLocaleString('en-NG')}\n\nDownload your payslip: ${process.env.APP_URL || 'http://localhost:3000'}/api/payslips/${payroll.id}/download${!staff.isRegistered ? `\n\nImportant: You need to complete your registration to access the payslip portal.` : ''}`
    })

    console.log(`✅ Payroll notification email sent to ${staff.email}: ${data.id}`)
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

// Test email function for debugging
export async function testEmailConfig(): Promise<{ success: boolean; message: string; details?: any }> {
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

    // Test the Mailgun client
    const testData = await mg.messages.create(MAILGUN_DOMAIN, {
      from: `Test <${FROM_EMAIL}>`,
      to: [FROM_EMAIL], // Send to yourself for testing
      subject: 'Test Email Configuration',
      text: 'This is a test email to verify your Mailgun configuration.',
      html: '<h1>Test Email</h1><p>This is a test email to verify your Mailgun configuration.</p>'
    })

    return { 
      success: true, 
      message: 'Email configuration test successful',
      details: { messageId: testData.id }
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