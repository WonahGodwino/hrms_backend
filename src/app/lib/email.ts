// src/app/lib/email.ts
import FormData from "form-data";
import Mailgun from "mailgun.js";
import { prisma } from "@/app/lib/db";
import { sign } from "jsonwebtoken";

type StaffLike = {
  id?: string;
  companyId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  staffId?: string;
  department?: string | null;
  position?: string | null;
  isRegistered?: boolean;
};

type PayrollLike = {
  id?: string;
  month: string;
  year: number;
  netSalary: number | string | any;
  isUpdate?: boolean;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

/**
 * Generate a secure JWT token for one-time email link access
 */
function generatePayslipAccessToken(
  staffRecordId: string,
  staffEmail: string,
  payslipId: string,
  staffFirstName: string
): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }
  
  const token = sign(
    {
      sub: staffRecordId,
      email: staffEmail,
      payslipId: payslipId,
      name: staffFirstName,
      purpose: "payslip_access",
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
      iss: "hrms-payslip-system",
      aud: "staff-portal",
    },
    jwtSecret
  );
  
  return token;
}

/**
 * Build a secure, user-specific payslip access link
 */
function buildPayslipAccessLink(
  staffRecord: StaffLike & { id: string },
  payslip: { id: string }
): string {
  if (!staffRecord.id) {
    throw new Error("staffRecord.id is required for generating access link");
  }
  
  if (!payslip.id) {
    throw new Error("payslip.id is required for generating access link");
  }
  
  if (!staffRecord.email) {
    throw new Error("staffRecord.email is required for generating access link");
  }
  
  if (!staffRecord.firstName) {
    throw new Error("staffRecord.firstName is required for generating access link");
  }
  
  // Generate secure token
  const token = generatePayslipAccessToken(
    staffRecord.id,
    staffRecord.email,
    payslip.id,
    staffRecord.firstName
  );
  
  // Determine base URL
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:5173";
  
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  
  // Create secure URL with token (single parameter)
  return `${cleanBaseUrl}/auth/payslip-access?token=${encodeURIComponent(token)}`;
}

/**
 * Build login link for new users (registration)
 */
function buildRegistrationLink(email: string, token?: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:5173";
  
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  
  let url = `${cleanBaseUrl}/complete-registration`;
  
  // Add email and token if provided
  if (email) {
    url += `?email=${encodeURIComponent(email)}`;
    if (token) {
      url += `&token=${encodeURIComponent(token)}`;
    }
  }
  
  return url;
}

function getMailgunClient() {
  const mailgun = new Mailgun(FormData);

  const apiKey =
    process.env.MAILGUN_API_KEY?.trim() ||
    process.env.API_KEY?.trim() || // allow alternate name
    "";

  if (!apiKey) throw new Error("Missing MAILGUN_API_KEY (or API_KEY)");

  return mailgun.client({
    username: "api",
    key: apiKey,
    url: process.env.MAILGUN_BASE_URL || "https://api.mailgun.net/v3",
  });
}

function normalizeFromAddress(from: string, sendingDomain: string) {
  const v = (from || "").trim();
  if (!v) return `HRMS <postmaster@${sendingDomain}>`;
  return v;
}

/**
 * Main function to send payroll notification email
 */
export async function sendPayrollNotificationEmail(
  staffRecord: StaffLike & { id: string },
  payroll: PayrollLike & { id: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate required parameters
    if (!staffRecord?.id) throw new Error("staffRecord.id is required");
    if (!staffRecord?.email) throw new Error("staffRecord.email is required");
    if (!staffRecord?.firstName) throw new Error("staffRecord.firstName is required");
    if (!staffRecord?.lastName) throw new Error("staffRecord.lastName is required");
    if (!payroll?.id) throw new Error("payroll.id is required");
    if (!payroll?.month) throw new Error("payroll.month is required");
    if (!payroll?.year) throw new Error("payroll.year is required");

    const mg = getMailgunClient();

    const sendingDomain =
      process.env.MAILGUN_DOMAIN?.trim() ||
      process.env.MAILGUN_SENDING_DOMAIN?.trim() ||
      "";

    if (!sendingDomain) {
      throw new Error(
        "Missing MAILGUN_DOMAIN (must be your Mailgun domain like sandboxxxx.mailgun.org or mg.yourdomain.com)"
      );
    }

    // ✅ Safely try to fetch company only if companyId exists
    let companyName = "Your Company";
    let companyFromEmail = normalizeFromAddress(
      process.env.MAILGUN_FROM_EMAIL || "",
      sendingDomain
    );

    if (staffRecord.companyId) {
      try {
        const company = await prisma.company.findUnique({
          where: { id: staffRecord.companyId },
        });

        if (company) {
          if (company.companyName) companyName = company.companyName;

          // Only use company email if it is a valid email; otherwise keep Mailgun_FROM
          if (company.email && company.email.includes("@")) {
            companyFromEmail = company.email;
          }
        }
      } catch (err) {
        console.error("Company lookup failed in sendPayrollNotificationEmail:", err);
      }
    }

    // Build appropriate links based on whether user is registered
    let accessLink = "";
    let isRegistered = staffRecord.isRegistered || false;
    let accessToken = "";
    
    // Generate token for both registered and unregistered users
    accessToken = generatePayslipAccessToken(
      staffRecord.id,
      staffRecord.email,
      payroll.id,
      staffRecord.firstName
    );

    if (isRegistered) {
      // Registered users get direct payslip access link
      accessLink = buildPayslipAccessLink(staffRecord, { id: payroll.id });
    } else {
      // Unregistered users get registration link with token
      accessLink = buildRegistrationLink(staffRecord.email, accessToken);
    }

    // Convert net salary to number
    const netAmount = typeof payroll.netSalary === "number"
      ? payroll.netSalary
      : Number(payroll.netSalary) || 0;

    const subject = payroll.isUpdate
      ? `Updated Payslip for ${payroll.month} ${payroll.year}`
      : `Your Payslip for ${payroll.month} ${payroll.year} is Ready`;

    const message = payroll.isUpdate
      ? `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> has been updated.`
      : `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> is ready.`;

    // Customize message based on registration status
    const actionMessage = isRegistered
      ? "Click the button below to securely access and download your payslip:"
      : "Click the button below to complete your registration and access your payslip:";

    const buttonText = isRegistered
      ? "View & Download Payslip"
      : "Complete Registration";

    // ✅ Same HTML you provided (kept intact) with updates
    const html = `
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
                "en-NG",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 }
              )}</p>
              ${staffRecord.department ? `<p style="margin: 0 0 4px 0;"><strong>Department:</strong> ${staffRecord.department}</p>` : ""}
              ${staffRecord.position ? `<p style="margin: 0;"><strong>Position:</strong> ${staffRecord.position}</p>` : ""}
            </div>
            
            <p style="margin: 0 0 20px 0;">${actionMessage}</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${accessLink}" style="display: inline-block; background: #2c5530; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                ${buttonText}
              </a>
            </div>
            
            <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 20px;">
              <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">If the button above doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-size: 14px; background: #f5f5f5; padding: 10px; border-radius: 4px;">${accessLink}</p>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: #f0f7f0; border-radius: 6px; border-left: 4px solid #2c5530;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #2c5530;"><strong>Security Information:</strong></p>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #555;">
                <li>This link is unique to you and should not be shared</li>
                <li>Link expires in 24 hours for security</li>
                <li>No additional information (like Staff ID) is required</li>
                <li>If you suspect unauthorized access, contact HR immediately</li>
              </ul>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 25px;">
              Best regards,<br><strong>${companyName} HR Department</strong>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send via Mailgun API (HTTPS)
    await mg.messages.create(sendingDomain, {
      from: companyFromEmail,
      to: [staffRecord.email],
      subject,
      html,
    });

    console.log(`✅ Payslip notification sent to ${staffRecord.email} (${isRegistered ? 'registered' : 'unregistered'})`);
    return { success: true };
  } catch (error: any) {
    console.error("❌ Failed to send payroll notification email:", error);
    return {
      success: false,
      error: error?.message || "Unknown error sending email",
    };
  }
}

/**
 * Helper function to send email after payslip generation
 */
export async function sendPayslipNotificationEmail(
  staffRecord: StaffLike & { id: string },
  payslip: any // Payslip record from database
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find the corresponding payroll record
    const payroll = await prisma.payroll.findUnique({
      where: { id: payslip.payrollId },
      select: {
        id: true,
        month: true,
        year: true,
        netSalary: true,
      }
    });

    if (!payroll) {
      throw new Error("Corresponding payroll record not found");
    }

    // Get staff registration status if not provided
    if (typeof staffRecord.isRegistered === 'undefined') {
      const staff = await prisma.staffRecord.findUnique({
        where: { id: staffRecord.id },
        select: { isRegistered: true }
      });
      staffRecord.isRegistered = staff?.isRegistered || false;
    }

    return await sendPayrollNotificationEmail(staffRecord, {
      ...payroll,
      id: payslip.id, // Use payslip ID for the access link
    });
  } catch (error: any) {
    console.error("❌ Failed to send payslip notification:", error);
    return {
      success: false,
      error: error?.message || "Unknown error",
    };
  }
}