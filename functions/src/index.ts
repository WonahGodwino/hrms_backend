import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';
import { prisma } from '.hrms-project/src/app/lib/db'; // Adjust the import as per your project structure

// Configure Nodemailer transporter with environment variables (use Gmail or other SMTP service)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),  // 587 for TLS or 465 for SSL
  secure: false,
  auth: {
    user: process.env.SMTP_USER,  // Your email address (e.g., 'your-email@gmail.com')
    pass: process.env.SMTP_PASS,  // Your email password or app password
  },
  connectionTimeout: 100000,  // Adjust timeouts if needed
  greetingTimeout: 100000,    // 10 seconds
  socketTimeout: 100000,      // 15 seconds
  pool: true,
  maxConnections: 20,
  maxMessages: 100,
  logger: true,  // Enable logger for debugging
  debug: true,   // Enable debugging (logs details to console)
});

type StaffLike = {
  companyId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  staffId?: string;
  department?: string | null;
  position?: string | null;
};

type PayrollLike = {
  month: string;
  year: number;
  netSalary: number;
  isUpdate?: boolean;  // Optional flag to check if the payroll is updated
};

// Firebase Cloud Function to send Payroll Notification Email
export const sendPayrollNotificationEmail = functions.https.onRequest(
  async (req, res) => {
    try {
      const { staffRecord, payroll }: { staffRecord: StaffLike; payroll: PayrollLike } =
        req.body;

      let companyName = 'Your Company';
      let companyFromEmail =
        process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@hrms.com';

      // Fetch company details based on companyId
      if (staffRecord.companyId) {
        try {
          const company = await prisma.company.findUnique({
            where: { id: staffRecord.companyId },
          });

          if (company) {
            if (company.companyName) companyName = company.companyName;
            if (company.email) companyFromEmail = company.email;
          }
        } catch (err) {
          // Log and continue with fallback from address
          console.error('Company lookup failed in sendPayrollNotificationEmail:', err);
        }
      }

      const loginLink =
        process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000/profile';

      const netAmount = typeof payroll.netSalary === 'number'
        ? payroll.netSalary
        : Number(payroll.netSalary) || 0;

      // Subject and message based on whether the payroll is updated
      const subject = payroll.isUpdate
        ? `Updated Payslip for ${payroll.month} ${payroll.year}`
        : `Your Payslip for ${payroll.month} ${payroll.year}`;

      const message = payroll.isUpdate
        ? `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> has been updated.`
        : `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> is ready.`;

      const mailOptions = {
        from: companyFromEmail, // Sender email address
        to: staffRecord.email,  // Dynamic recipient email
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
                  ${staffRecord.department ? `<p><strong>Department:</strong> ${staffRecord.department}</p>` : ''}
                  ${staffRecord.position ? `<p><strong>Position:</strong> ${staffRecord.position}</p>` : ''}
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${loginLink}" style="display: inline-block; background: #2c5530; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                    View Payslip
                  </a>
                </div>
                <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 20px;">
                  <p>If the button above doesn't work, copy and paste this link into your browser:</p>
                  <p style="word-break: break-all;">${loginLink}</p>
                </div>
                <p style="color: #666; font-size: 14px;">
                  Best regards,<br><strong>${companyName} HR Department</strong>
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      };

      // Send email using the transporter
      await transporter.sendMail(mailOptions);
      return res.status(200).send({ message: 'Email sent successfully!' });
    } catch (error: any) {
      console.error('Failed to send payroll notification email:', error);
      return res.status(500).send({
        error: error.message || 'Unknown error sending email',
      });
    }
  }
);
