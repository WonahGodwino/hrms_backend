// src/app/lib/payroll/seed-default-payslip-preset.ts
//
// Seeds the bundled payslip-preset-1.html as a PayslipPreset for a company,
// so it's available as a generic "Payslip Layout" option on the Payroll
// Template form from day one. The HTML itself has no company branding
// baked in - company name and all other values are interpolated per-company
// at generation time. Called right after a company is created (see
// auth/companies/register/route.ts) and by the one-off backfill script
// (scripts/seed-payslip-preset-1.ts) for existing companies.
import fs from 'fs'
import path from 'path'
import { prisma } from '@/app/lib/db'

export const DEFAULT_PAYSLIP_PRESET_NAME = 'Payslip Preset 1'

export async function seedDefaultPayslipPreset(companyId: string, actor = 'SYSTEM_SEED') {
  // Matched by isSeed rather than name so a renamed/retranslated default
  // preset doesn't get recreated as a duplicate.
  const existing = await prisma.payslipPreset.findFirst({
    where: { companyId, isSeed: true },
    select: { id: true },
  })
  if (existing) return existing

  const filePath = path.join(process.cwd(), 'public', 'payslips', 'presets', 'payslip-preset-1.html')
  const htmlContent = fs.readFileSync(filePath, 'utf-8')

  return prisma.payslipPreset.create({
    data: {
      companyId,
      name: DEFAULT_PAYSLIP_PRESET_NAME,
      description: 'Bundled sample payslip layout.',
      htmlContent,
      isActive: true,
      isSeed: true,
      createdBy: actor,
    },
  })
}
