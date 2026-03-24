import fs from 'fs'
import path from 'path'
import { generateEnhancedPayslipPdf } from '../src/app/lib/payroll/generateEnhancedPayslipPdf'

async function main() {
  const result = await generateEnhancedPayslipPdf({
    staff: {
      staffId: 'BRG-001',
      firstName: 'Amina',
      lastName: 'Okafor',
      email: 'amina.okafor@blueridge.example',
      department: 'Finance',
      designation: 'Senior Accountant',
      position: 'Senior Accountant',
      companyName: 'Blueridge Integrated Services Ltd',
      companyAddress: '12 Admiralty Way, Lekki Phase 1, Lagos',
      companyPhone: '+234 803 000 1234',
      companyTaxId: 'TIN-12345678',
    },
    payroll: {
      rowNumber: 1,
      staffId: 'BRG-001',
      email: 'amina.okafor@blueridge.example',
      fullName: 'Amina Okafor',
      periodMonth: 3,
      periodYear: 2026,
      basicSalary: 420000,
      housingAllowance: 90000,
      transportAllowance: 0,
      transportationAllowance: 60000,
      otherAllowances: 25000,
      grossPay: 720000,
      payee: 58000,
      pension: 57600,
      netPay: 604400,
      daysInMonth: 31,
      daysWorked: 31,
      rawRow: {},
      bonusKPI: 35000,
      deductions: 0,
      position: 'Senior Accountant',
      overtimeIncome: 18000,
      communicationAllowance: 15000,
      outstandingIncome: 12000,
      dressingAllowance: 10000,
      leaveAllowance: 12000,
      entertainmentAllowance: 8000,
      utilityAllowance: 7000,
      proratedGrossPay: 420000,
      walletPayment: 304400,
      commercialPayment: 300000,
    },
    companyInfo: {
      name: 'Blueridge Integrated Services Ltd',
      address: '12 Admiralty Way, Lekki Phase 1, Lagos',
      phone: '+234 803 000 1234',
      email: 'hr@blueridge.example',
      taxId: 'TIN-12345678',
    },
  })

  const outDir = path.join(process.cwd(), 'public', 'payslips', 'font-test')
  const outPath = path.join(outDir, 'enhanced-font-test.pdf')

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPath, Buffer.from(result.pdfBuffer))

  console.log(`Sample generated: ${outPath}`)
}

main().catch((error) => {
  console.error('Failed to regenerate sample enhanced payslip:', error)
  process.exit(1)
})
