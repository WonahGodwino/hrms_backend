// src/app/lib/email.ts
import FormData from "form-data";
import Mailgun from "mailgun.js";
import { prisma } from "@/app/lib/db";

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
  isUpdate?: boolean;
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

/**
 * IMPORTANT:
 * - For emails, the link must be your FRONTEND URL (where the user logs in)
 * - Do NOT use your backend Render URL as APP_URL/NEXTAUTH_URL for this
 */
function buildLoginLink(): string {
  const base =
   // process.env.APP_URL?.trim() ||
    //process.env.NEXTAUTH_URL?.trim() ||
    //process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:5173/complete-registration";

  const clean = base.replace(/\/$/, "");
  return clean.endsWith("/complete-registration") ? clean : `${clean}/complete-registration`;
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
    // If your Mailgun account is EU-based, set:
    url:process.env.BASE_URL,
  });
}

function normalizeFromAddress(from: string, sendingDomain: string) {
  const v = (from || "").trim();
  if (!v) return `HRMS <postmaster@${sendingDomain}>`;
  return v;
}

export async function sendPayrollNotificationEmail(
  staffRecord: StaffLike,
  payroll: PayrollLike
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!staffRecord?.email) throw new Error("staffRecord.email is required");
    if (!staffRecord?.firstName) throw new Error("staffRecord.firstName is required");
    if (!staffRecord?.lastName) throw new Error("staffRecord.lastName is required");
    if (!payroll?.month) throw new Error("payroll.month is required");
    if (!payroll?.year) throw new Error("payroll.year is required");

    const mg = getMailgunClient();

    /**
     * MAILGUN_DOMAIN must be your Mailgun sending domain, e.g:
     * - sandboxxxxx.mailgun.org
     * - mg.yourdomain.com (verified)
     *
     * NOT your Render URL.
     */
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

    const loginLink = buildLoginLink();

    const netAmount =
      typeof payroll.netSalary === "number"
        ? payroll.netSalary
        : Number(payroll.netSalary) || 0;

    const subject = payroll.isUpdate
      ? `Updated Payslip for ${payroll.month} ${payroll.year}`
      : `Your Payslip for ${payroll.month} ${payroll.year}`;

    const message = payroll.isUpdate
      ? `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> has been updated.`
      : `Your payslip for <strong>${payroll.month} ${payroll.year}</strong> is ready.`;

    // ✅ Same HTML you provided (kept intact)
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
              ${staffRecord.department ? `<p><strong>Department:</strong> ${staffRecord.department}</p>` : ""}
              ${staffRecord.position ? `<p><strong>Position:</strong> ${staffRecord.position}</p>` : ""}
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
    `;

    // Send via Mailgun API (HTTPS)
    await mg.messages.create(sendingDomain, {
      from: companyFromEmail,
      to: [staffRecord.email],
      subject,
      html,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Failed to send payroll notification email:", error);
    return {
      success: false,
      error: error?.message || "Unknown error sending email",
    };
  }
}
