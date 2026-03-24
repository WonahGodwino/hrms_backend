import fs from 'fs'
import path from 'path'
import { generatePayslipPdf } from '../src/app/lib/payroll/generatePayslipPdf'

async function main() {
  const result = await generatePayslipPdf({
    templateType: 'ISURF_STANDARD',
    staff: {
      staffId: 'ISR-001',
      firstName: 'Tunde',
      lastName: 'Adebayo',
      email: 'tunde.adebayo@isurf.example',
      department: 'Operations',
      designation: 'Operations Lead',
      position: 'Operations Lead',
      companyName: 'ISURF Global Services Ltd',
      companyAddress: '24 Isaac John Street, GRA, Ikeja, Lagos',
      companyPhone: '+234 803 111 2233',
    },
    payroll: {
      rowNumber: 1,
      staffId: 'ISR-001',
      email: 'tunde.adebayo@isurf.example',
      fullName: 'Tunde Adebayo',
      periodMonth: 3,
      periodYear: 2026,
      basicSalary: 350000,
      housingAllowance: 70000,
      transportAllowance: 50000,
      transportationAllowance: 20000,
      otherAllowances: 15000,
      grossPay: 505000,
      payee: 42000,
      pension: 40400,
      netPay: 422600,
      daysInMonth: 31,
      daysWorked: 30,
      rawRow: {},
      bonusKPI: 0,
      deductions: 0,
    },
  })

  const outDir = path.join(process.cwd(), 'public', 'payslips', 'font-test')
  const outPath = path.join(outDir, 'standard-font-test.pdf')

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPath, Buffer.from(result.pdfBuffer))

  console.log(`Sample generated: ${outPath}`)
}

main().catch((error) => {
  console.error('Failed to regenerate sample standard payslip:', error)
  process.exit(1)
})
