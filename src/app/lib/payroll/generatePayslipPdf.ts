// src/app/lib/payroll/generatePayslipPdf.ts
import puppeteer from "puppeteer";
import path from "path";
import { mkdir } from "fs/promises";
import fs from "fs/promises";
import type { GeneratePayslipInput } from "./types";

type PayslipPdfResult = {
  filePath: string; // DB-safe relative path: uploads/payslips/xxx.pdf
  fileName: string;
};

function toSafeFileName(v: string) {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toPosix(p: string) {
  return p.split(path.sep).join(path.posix.sep);
}

export async function generatePayslipPdf(
  input: GeneratePayslipInput
): Promise<PayslipPdfResult> {
  // ✅ One canonical storage root for EVERYTHING
  // - local: <project>/uploads/...
  // - render with disk: set STORAGE_ROOT=/var/data (recommended)
  const storageRoot = process.env.STORAGE_ROOT?.trim() || process.cwd();
  const payslipsDirAbs = path.join(storageRoot, "uploads", "payslips");
  await mkdir(payslipsDirAbs, { recursive: true });

  const staffIdSafe = toSafeFileName(input.staff.staffId || "UNKNOWN");
  const monthSafe = String(input.payroll.periodMonth || 0).padStart(2, "0");
  const yearSafe = String(input.payroll.periodYear || new Date().getFullYear());
  const fileName = `payslip-${staffIdSafe}-${monthSafe}-${yearSafe}-${Date.now()}.pdf`;

  const pdfAbsPath = path.join(payslipsDirAbs, fileName);
  const htmlContent = generatePayslipHtml(input);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    // If you ever need a custom chromium path in production:
    // executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    await page.pdf({
      path: pdfAbsPath,
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    });

    // Sanity check: make sure file really exists
    await fs.access(pdfAbsPath);

    // ✅ DB-safe relative path (always POSIX)
    // If STORAGE_ROOT is process.cwd(), this becomes uploads/payslips/...
    // If STORAGE_ROOT is /var/data, still store uploads/payslips/... (portable)
    const filePathDb = toPosix(path.join("uploads", "payslips", fileName));

    return { filePath: filePathDb, fileName };
  } finally {
    await browser.close();
  }
}

function generatePayslipHtml(input: GeneratePayslipInput): string {
  const { staff, payroll } = input;

  // Calculate total deductions
  const totalDeductions = (payroll.payee || 0) + (payroll.pension || 0);
  const netPay = payroll.netPay || 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payslip - ${staff.firstName} ${staff.lastName}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c5530; padding-bottom: 20px; }
        .company-name { font-size: 24px; font-weight: bold; color: #2c5530; margin-bottom: 5px; }
        .document-title { font-size: 18px; color: #666; margin-bottom: 20px; }
        .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .staff-info, .payroll-info { width: 48%; }
        .info-row { margin-bottom: 8px; }
        .info-label { font-weight: bold; color: #555; display: inline-block; width: 150px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #f8f9fa; text-align: left; padding: 10px; border: 1px solid #dee2e6; font-weight: bold; color: #495057; }
        td { padding: 10px; border: 1px solid #dee2e6; }
        .text-right { text-align: right; }
        .total-row { background-color: #f8f9fa; font-weight: bold; }
        .section-title { background-color: #2c5530; color: white; padding: 10px; font-weight: bold; margin-bottom: 10px; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">${staff.companyName || "Company Name"}</div>
        <div class="document-title">PAYSLIP</div>
        <div>Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}</div>
      </div>

      <div class="info-section">
        <div class="staff-info">
          <div class="info-row"><span class="info-label">Staff ID:</span> ${staff.staffId}</div>
          <div class="info-row"><span class="info-label">Name:</span> ${staff.firstName} ${staff.lastName}</div>
          <div class="info-row"><span class="info-label">Email:</span> ${staff.email}</div>
          ${staff.department ? `<div class="info-row"><span class="info-label">Department:</span> ${staff.department}</div>` : ""}
          ${staff.designation ? `<div class="info-row"><span class="info-label">Position:</span> ${staff.designation}</div>` : ""}
        </div>

        <div class="payroll-info">
          <div class="info-row"><span class="info-label">Pay Period:</span> ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}</div>
          <div class="info-row"><span class="info-label">Days in Month:</span> ${payroll.daysInMonth}</div>
          <div class="info-row"><span class="info-label">Days Worked:</span> ${payroll.daysWorked}</div>
          <div class="info-row"><span class="info-label">Payment Date:</span> ${new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <div>
        <div class="section-title">EARNINGS</div>
        <table>
          <thead><tr><th>Description</th><th class="text-right">Amount (₦)</th></tr></thead>
          <tbody>
            <tr><td>Basic Salary</td><td class="text-right">${formatCurrency(payroll.basicSalary)}</td></tr>
            ${payroll.housingAllowance > 0 ? `<tr><td>Housing Allowance</td><td class="text-right">${formatCurrency(payroll.housingAllowance)}</td></tr>` : ""}
            ${payroll.transportAllowance > 0 ? `<tr><td>Transport Allowance</td><td class="text-right">${formatCurrency(payroll.transportAllowance)}</td></tr>` : ""}
            ${payroll.transportationAllowance > 0 ? `<tr><td>Transportation Allowance</td><td class="text-right">${formatCurrency(payroll.transportationAllowance)}</td></tr>` : ""}
            ${payroll.otherAllowances > 0 ? `<tr><td>Other Allowances</td><td class="text-right">${formatCurrency(payroll.otherAllowances)}</td></tr>` : ""}
            <tr class="total-row"><td>Total Earnings</td><td class="text-right">${formatCurrency(payroll.grossPay)}</td></tr>
          </tbody>
        </table>

        <div class="section-title">DEDUCTIONS</div>
        <table>
          <thead><tr><th>Description</th><th class="text-right">Amount (₦)</th></tr></thead>
          <tbody>
            ${payroll.payee > 0 ? `<tr><td>PAYE Tax</td><td class="text-right">${formatCurrency(payroll.payee)}</td></tr>` : ""}
            ${payroll.pension > 0 ? `<tr><td>Pension Contribution</td><td class="text-right">${formatCurrency(payroll.pension)}</td></tr>` : ""}
            <tr class="total-row"><td>Total Deductions</td><td class="text-right">${formatCurrency(totalDeductions)}</td></tr>
          </tbody>
        </table>

        <div class="section-title">SUMMARY</div>
        <table>
          <tbody>
            <tr><td><b>Gross Pay</b></td><td class="text-right"><b>${formatCurrency(payroll.grossPay)}</b></td></tr>
            <tr><td><b>Total Deductions</b></td><td class="text-right"><b>${formatCurrency(totalDeductions)}</b></td></tr>
            <tr class="total-row"><td><b>NET PAY</b></td><td class="text-right"><b>${formatCurrency(netPay)}</b></td></tr>
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>This is a computer-generated document. No signature is required.</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `;
}

function getMonthName(monthNumber: number): string {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return months[monthNumber - 1] || `Month ${monthNumber || 0}`;
}

function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}
