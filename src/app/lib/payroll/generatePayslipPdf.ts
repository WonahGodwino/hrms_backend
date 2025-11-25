// src/app/lib/payroll/generatePayslipPdf.ts
import PDFDocument from 'pdfkit'
import { mkdir } from 'fs/promises'
import fs from 'fs'
import path from 'path'
import type { GeneratePayslipInput } from './types'

function formatCurrency(n: number) {
  const safe = Number.isFinite(n) ? n : 0
  return `₦${safe.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
}

export async function generatePayslipPdf(input: GeneratePayslipInput): Promise<{ pdfPath: string }> {
  const { staff, payroll } = input

  const payslipDir = path.join(process.cwd(), 'public', 'payslips')
  await mkdir(payslipDir, { recursive: true })

  const safeMonth = payroll.periodMonth.toString().padStart(2, '0')
  const fileNameBase = `payslip-${staff.staffId}-${safeMonth}-${payroll.periodYear}`
  let fileName = `${fileNameBase}.pdf`
  let absPath = path.join(payslipDir, fileName)

  // avoid overwriting if already exists
  if (fs.existsSync(absPath)) {
    fileName = `${fileNameBase}-${Date.now()}.pdf`
    absPath = path.join(payslipDir, fileName)
  }

  const doc = new PDFDocument({ margin: 40, size: 'A4' })
  const writeStream = fs.createWriteStream(absPath)
  doc.pipe(writeStream)

  // ===== Header =====
  doc
    .rect(0, 0, doc.page.width, 80)
    .fill('#1e3a5f')

  doc
    .fillColor('#ffffff')
    .fontSize(18)
    .text(staff.companyName || 'COMPANY NAME LTD', 40, 25)

  doc
    .fontSize(11)
    .text('Salary Payslip', 40, 50)

  doc
    .fillColor('#000000')
    .fontSize(10)
    .text(`Pay Period: ${safeMonth}/${payroll.periodYear}`, doc.page.width - 220, 30)
    .text(`Generated: ${new Date().toLocaleDateString()}`, doc.page.width - 220, 45)

  // ===== Staff block =====
  const top = 100
  doc
    .roundedRect(40, top, doc.page.width - 80, 90, 6)
    .fill('#f3f6fb')

  doc.fillColor('#000000').fontSize(11)
    .text(`Staff Name: ${staff.firstName} ${staff.lastName}`, 55, top + 15)
    .text(`Staff ID: ${staff.staffId}`, 55, top + 32)
    .text(`Email: ${staff.email}`, 55, top + 49)

  doc
    .text(`Department: ${staff.department || 'N/A'}`, doc.page.width / 2 + 10, top + 15)
    .text(`Designation: ${staff.designation || 'N/A'}`, doc.page.width / 2 + 10, top + 32)

  // ===== Earnings section =====
  let y = top + 115
  doc.fontSize(12).fillColor('#1e3a5f').text('EARNINGS', 40, y)
  y += 15
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#1e3a5f')
  y += 10

  const earnings = [
    ['Basic Salary', payroll.basicSalary],
    ['Housing Allowance', payroll.housingAllowance],
    ['Transport Allowance', payroll.transportAllowance],
    ['Dressing / Transportation', payroll.transportationAllowance],
    ['Other Allowances', payroll.otherAllowances],
  ]

  doc.fontSize(10).fillColor('#000000')
  for (const [label, value] of earnings) {
    doc.text(label, 50, y)
    doc.text(formatCurrency(value as number), doc.page.width - 180, y, { width: 130, align: 'right' })
    y += 18
  }

  doc.fontSize(11).fillColor('#0f5132')
    .text('Total Gross Pay', 50, y + 5)
  doc.fontSize(11).fillColor('#0f5132')
    .text(formatCurrency(payroll.grossPay), doc.page.width - 180, y + 5, { width: 130, align: 'right' })

  y += 35

  // ===== Deductions section =====
  doc.fontSize(12).fillColor('#8b0000').text('DEDUCTIONS', 40, y)
  y += 15
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#8b0000')
  y += 10

  const deductions = [
    ['PAYE', payroll.payee],
    ['Pension', payroll.pension],
  ]

  doc.fontSize(10).fillColor('#000000')
  for (const [label, value] of deductions) {
    doc.text(label, 50, y)
    doc.text(formatCurrency(value as number), doc.page.width - 180, y, { width: 130, align: 'right' })
    y += 18
  }

  const totalDeductions = payroll.payee + payroll.pension

  doc.fontSize(11).fillColor('#8b0000')
    .text('Total Deductions', 50, y + 5)
  doc.fontSize(11).fillColor('#8b0000')
    .text(formatCurrency(totalDeductions), doc.page.width - 180, y + 5, { width: 130, align: 'right' })

  y += 45

  // ===== Net Pay block =====
  doc
    .roundedRect(40, y, doc.page.width - 80, 45, 6)
    .fill('#e8f0ff')

  doc.fillColor('#0b1f44').fontSize(14)
    .text('NET SALARY', 55, y + 13)

  doc.fillColor('#0b1f44').fontSize(14)
    .text(formatCurrency(payroll.netPay), doc.page.width - 200, y + 13, { width: 150, align: 'right' })

  y += 70

  // ===== Attendance =====
  doc.fillColor('#000000').fontSize(10)
    .text(`Working Days In Month: ${payroll.daysInMonth}`, 50, y)
    .text(`Days Worked: ${payroll.daysWorked}`, doc.page.width / 2 + 10, y)

  // Footer
  doc.fontSize(8).fillColor('#666666')
    .text('This is a system-generated payslip. No signature required.',
      40, doc.page.height - 40, { align: 'center', width: doc.page.width - 80 })

  doc.end()

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', () => resolve())
    writeStream.on('error', reject)
  })

  // return path as a URL-like value to store in DB
  const publicPath = `/payslips/${fileName}`
  return { pdfPath: publicPath }
}
