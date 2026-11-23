// scripts/seed-payslip-preset-1.ts
//
// One-off backfill: seeds the bundled payslip-preset-1.html as a
// PayslipPreset for every existing company that doesn't already have one.
// New companies get this automatically via seedDefaultPayslipPreset(),
// called from the company registration route — this script only exists to
// backfill companies created before that was wired in.
import 'dotenv/config'
import { prisma } from '../src/app/lib/db'
import { seedDefaultPayslipPreset, DEFAULT_PAYSLIP_PRESET_NAME } from '../src/app/lib/payroll/seed-default-payslip-preset'

const loadEnv = () => {
  try {
    require('dotenv').config({ path: '.env.production' })
  } catch {
    require('dotenv').config()
  }
}
loadEnv()

async function backfillPayslipPreset1() {
  console.log('Backfilling payslip-preset-1.html as a PayslipPreset for all companies...')
  try {
    const companies = await prisma.company.findMany({ where: { archived: 0 }, select: { id: true, companyName: true } })
    console.log(`Found ${companies.length} companies`)

    let created = 0
    for (const company of companies) {
      const existingBefore = await prisma.payslipPreset.findFirst({
        where: { companyId: company.id, name: DEFAULT_PAYSLIP_PRESET_NAME },
        select: { id: true },
      })
      await seedDefaultPayslipPreset(company.id)
      if (!existingBefore) {
        created++
        console.log(`Created preset for ${company.companyName}`)
      } else {
        console.log(`Skipping ${company.companyName} - preset already exists`)
      }
    }

    console.log(`Done. Created ${created} new preset(s), skipped ${companies.length - created} existing.`)
  } catch (error) {
    console.error('Error backfilling payslip preset:', error instanceof Error ? error.message : error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

backfillPayslipPreset1()
