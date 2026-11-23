import fs from 'fs'
import { generatePayslipPdf } from '../src/app/lib/phed/pdf-payslip'

const data = {
  companyName: 'Port Harcourt Electricity Distribution Plc',
  companyAddress: 'No.1 Moscow Road, Port Harcourt, Rivers State, Nigeria',
  staffName: 'Jane Okafor',
  staffIdCode: 'E-1001',
  gradeName: 'Grade Level 12',
  department: 'Human Resources',
  unit: 'Payroll',
  regionName: 'Port Harcourt',
  category: 'REGULAR',
  role: 'HR Officer',
  feeder: 'PH Main Feeder',
  nhfNumber: 'NHF-00012345',
  franchiseState: 'Rivers',
  month: 10,
  year: 2026,
  periodName: 'October 2026',

  basicSalary: 400000,
  housingAllowance: 150000,
  transportAllowance: 80000,
  furnitureAllowance: 40000,
  mealSubsidy: 30000,
  utilityAllowance: 25000,
  leaveAllowance: 20000,
  domesticAllowance: 35000,
  hazardAllowance: 15000,
  electricityAllowance: 12000,
  discoveryAllowance: 10000,
  carSubsidy: 30000,
  entertainmentAllowance: 10000,
  dataAllowance: 5000,
  nightAllowance: 8000,
  arrears: 0,
  otherAllowances: 6000,
  overtimeEarnings: 15000,
  grossSalary: 891000,

  pensionEmployee: 50400,
  pensionEmployer: 63000,
  nhf: 10000,
  monthlyPAYE: 24500,
  insurance: 2500,
  loan: 50000,
  unions: [
    { name: 'NUEE', amount: 15200 },
    { name: 'SSAEAC', amount: 12000 },
  ],
  cooperatives: [
    { name: 'PH Zonal Thrift', amount: 15000 },
    { name: 'IEL Coop', amount: 5000 },
    { name: 'NSMPCS Uyo', amount: 3000 },
  ],
  deductionLiabilities: 3000,
  otherDeductions: 0,
  totalDeductions: 194600,
  netSalary: 696400,

  annualGrossIncome: 10692000,
  annualRentRelief: 500000,
  lifeAssuranceAmount: 0,
  annualPensionDeduction: 604800,
  annualChargeableIncome: 9587200,
  annualPAYE: 294000,

  bankName: 'Zenith Bank',
  accountNumber: '1234567890',
  accountName: 'Okafor Jane',
  pfaName: 'Stanbic IBTC Pension',
  rsaPin: 'PEN1234567890',
  pensionNumber: 'PEN1234567890',
  tin: '12345678-0001',
} as any

async function main() {
  const pdf = await generatePayslipPdf(data)
  const out = 'C:/247HR/backend/public/payslips/sample-payslip.pdf'
  fs.mkdirSync('C:/247HR/backend/public/payslips', { recursive: true })
  fs.writeFileSync(out, pdf)
  console.log('WROTE', out, pdf.length, 'bytes')
}

main().catch((e) => { console.error(e); process.exit(1) })
