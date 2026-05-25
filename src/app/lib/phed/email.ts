// ============================================================
// PHED Module – Welcome Email
// Sent to newly onboarded PHED staff with their login
// credentials and a prompt to change password on first login.
// ============================================================

import { sendEmail } from '@/app/lib/email'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'
const FROM_EMAIL   = process.env.FROM_EMAIL    || 'noreply@ms.hr247.co.uk'

const BRAND_BLUE  = '#1a3a5c'
const BRAND_MID   = '#2d5080'
const ACCENT_BLUE = '#e8f0fe'

export async function sendPhedWelcomeEmail(options: {
  firstName:   string
  lastName:    string
  email:       string
  staffId:     string
  password:    string   // plain-text temporary password (before hashing)
  companyName: string
}): Promise<{ success: boolean; error?: string }> {
  const { firstName, lastName, email, staffId, password, companyName } = options
  const loginUrl = `${FRONTEND_URL}/login`

  const subject = `Welcome to ${companyName} – Your 24/7HR Account is Ready`

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_BLUE};padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#c8d8eb;font-size:13px;letter-spacing:1px;text-transform:uppercase;">24/7HR Platform</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">${companyName}</h1>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:36px 40px 0;">
              <p style="margin:0;font-size:16px;color:#1f2937;">Dear <strong>${firstName} ${lastName}</strong>,</p>
              <p style="margin:16px 0 0;font-size:15px;color:#374151;line-height:1.7;">
                Welcome to <strong>${companyName}</strong>! Your employee account on the 24/7HR platform has been set up
                and is ready for you to access. You can log in to view your payslips, check payroll information,
                and manage your profile.
              </p>
            </td>
          </tr>

          <!-- Credentials box -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${ACCENT_BLUE};border-left:4px solid ${BRAND_BLUE};border-radius:4px;padding:20px 24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:${BRAND_BLUE};text-transform:uppercase;letter-spacing:0.5px;">Your Login Credentials</p>
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:13px;color:#6b7280;width:110px;padding-bottom:8px;">Staff ID</td>
                        <td style="font-size:13px;color:#111827;font-weight:600;padding-bottom:8px;">${staffId}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;width:110px;padding-bottom:8px;">Email</td>
                        <td style="font-size:13px;color:#111827;font-weight:600;padding-bottom:8px;">${email}</td>
                      </tr>
                      <tr>
                        <td style="font-size:13px;color:#6b7280;width:110px;">Password</td>
                        <td style="font-size:14px;color:${BRAND_BLUE};font-weight:700;font-family:Courier New,monospace;letter-spacing:1px;">${password}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Password change notice -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff7ed;border:1px solid #fed7aa;border-radius:4px;padding:16px 20px;">
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;color:#92400e;">
                      <strong>Important:</strong> For your security, you will be required to change your password
                      immediately after your first login. Please choose a strong, unique password.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Login button -->
          <tr>
            <td style="padding:32px 40px;text-align:center;">
              <a href="${loginUrl}" style="display:inline-block;background-color:${BRAND_BLUE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:6px;letter-spacing:0.3px;">
                Log In to 24/7HR
              </a>
              <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
                Or copy this link into your browser:<br>
                <a href="${loginUrl}" style="color:${BRAND_MID};">${loginUrl}</a>
              </p>
            </td>
          </tr>

          <!-- What you can do -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#374151;">What you can do on the platform:</p>
              <ul style="margin:0;padding-left:20px;font-size:13px;color:#6b7280;line-height:2;">
                <li>View and download your monthly payslips as PDF</li>
                <li>Check your payroll history across all pay periods</li>
                <li>Review your earnings, deductions, and tax breakdown</li>
              </ul>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.7;">
                This is an automated message from <strong>${companyName}</strong> via the 24/7HR Platform.<br>
                Please do not reply to this email. For assistance, contact your HR department.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`

  const text = `
Dear ${firstName} ${lastName},

Welcome to ${companyName}! Your employee account on the 24/7HR platform is ready.

YOUR LOGIN CREDENTIALS
----------------------
Staff ID : ${staffId}
Email    : ${email}
Password : ${password}

IMPORTANT: You will be required to change your password immediately after your first login.

Login here: ${loginUrl}

What you can do on the platform:
- View and download your monthly payslips as PDF
- Check your payroll history across all pay periods
- Review your earnings, deductions, and tax breakdown

This is an automated message from ${companyName}. Please do not reply.
For assistance, contact your HR department.
`.trim()

  return sendEmail({
    to:      email,
    subject,
    html,
    text,
    from: `${companyName} HR <${FROM_EMAIL}>`,
  })
}

