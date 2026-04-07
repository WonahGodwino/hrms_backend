import fs from 'fs'
import path from 'path'
import { PDFParse } from 'pdf-parse'
import { generateEnhancedPayslipPdf } from '../src/app/lib/payroll/generateEnhancedPayslipPdf'

async function main() {
  const { pdfBuffer, fileName } = await generateEnhancedPayslipPdf({
    staff: {
      staffId: 'EMP-001',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      department: 'Finance',
      designation: 'Analyst',
      position: 'Analyst',
      companyName: 'ISURF HR',
      companyAddress: '1 Broad Street, Lagos',
      companyPhone: '+2348000000000',
      companyLogo: '',
      companyTaxId: 'TIN-123456',
    },
    payroll: {
      rowNumber: 2,
      staffId: 'EMP-001',
      email: 'jane.doe@example.com',
      fullName: 'Jane Doe',
      periodMonth: 3,
      periodYear: 2026,
      basicSalary: 200000,
      housingAllowance: 0,
      transportAllowance: 0,
      transportationAllowance: 0,
      otherAllowances: 0,
      grossPay: 200000,
      payee: 0,
      pension: 0,
      netPay: 180000,
      daysInMonth: 31,
      daysWorked: 29,
      rawRow: {},
      deductions: 20000,
      walletPayment: 180000,
      commercialPayment: 0,
      proratedGrossPay: 0,
    },
    companyInfo: {
      name: 'ISURF HR',
      address: '1 Broad Street, Lagos',
      phone: '+2348000000000',
      email: 'hr@example.com',
      logo: '',
      taxId: 'TIN-123456',
    },
    earnings: [
      { label: 'Base Salary', value: 200000, type: 'earnings' },
    ],
    deductions: [
      { label: 'Tax', value: 20000, type: 'deduction' },
    ],
    summary: {
      grossPay: 200000,
      totalDeductions: 20000,
      netPay: 180000,
    },
    templateName: 'Dynamic Template QA',
  })

  const outputDir = path.join(process.cwd(), 'public', 'payslips', 'test-setup')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, fileName)
  fs.writeFileSync(outputPath, Buffer.from(pdfBuffer))

  const parser = new PDFParse({ data: Buffer.from(pdfBuffer) })
  const parsed = await parser.getText()
  const text = parsed.text

  const checks = [
    'Number of days in the month: 31',
    'Number of days worked: 29',
    'Pay Period: March 2026',
  ]

  const missing = checks.filter((check) => !text.includes(check))

  console.log('Generated file:', outputPath)
  if (missing.length > 0) {
    console.error('FAILED: Missing expected text in PDF:')
    missing.forEach((item) => console.error('-', item))
    process.exit(1)
  }

  console.log('PASS: Enhanced PDF includes pay period and attendance fields.')
}

main().catch((error) => {
  console.error('FAILED:', error)
  process.exit(1)
})
