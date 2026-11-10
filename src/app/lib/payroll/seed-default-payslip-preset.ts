// src/app/lib/payroll/seed-default-payslip-preset.ts
//
// Seeds the bundled payslip-preset-1.html as a PayslipPreset for a company,
// so it's available as a generic "Payslip Layout" option on the Payroll
// Template form from day one. The HTML itself has no company branding
// baked in - company name and all other values are interpolated per-company
// at generation time.
//
// The preset is guaranteed to exist through three paths, so it stays part of
// the application on every deployment:
//   1. New companies: seeded at creation (auth/companies/register, trial signup).
//   2. Existing companies: ensureDefaultPayslipPreset() runs whenever the
//      preset list is read (api/payroll/payslip-presets GET), so any company
//      that is missing it - including ones created before this existed -
//      gets it the first time its template page loads. No deploy step needed.
//   3. scripts/seed-payslip-preset-1.ts for an explicit bulk backfill.
// Built-in presets cannot be deleted (see payslip-presets/[id] DELETE).
import fs from 'fs'
import path from 'path'
import { prisma } from '@/app/lib/db'

export const DEFAULT_PAYSLIP_PRESET_NAME = 'Payslip Preset 1'

function readBundledPresetHtml(): string {
  const filePath = path.join(process.cwd(), 'public', 'payslips', 'presets', 'payslip-preset-1.html')
  return fs.readFileSync(filePath, 'utf-8')
}

export async function seedDefaultPayslipPreset(companyId: string, actor = 'SYSTEM_SEED') {
  // Matched by isSeed rather than name so a renamed/retranslated default
  // preset doesn't get recreated as a duplicate.
  const existing = await prisma.payslipPreset.findFirst({
    where: { companyId, isSeed: true },
    select: { id: true },
  })
  if (existing) return existing

  const htmlContent = readBundledPresetHtml()

  // PayslipPreset has no unique key on (companyId, isSeed), so two concurrent
  // first loads could both create the row. A per-company transaction-scoped
  // advisory lock serialises them: the loser re-checks and finds the winner's row.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payslip-preset-seed:${companyId}`}))`
    const again = await tx.payslipPreset.findFirst({ where: { companyId, isSeed: true }, select: { id: true } })
    if (again) return again
    return tx.payslipPreset.create({
      data: {
        companyId,
        name: DEFAULT_PAYSLIP_PRESET_NAME,
        description: 'Bundled sample payslip layout.',
        htmlContent,
        isActive: true,
        isSeed: true,
        createdBy: actor,
      },
      select: { id: true },
    })
  })
}

/**
 * Same as seedDefaultPayslipPreset but never throws, for call sites (like a
 * list endpoint) where a seeding problem must not break the request.
 */
export async function ensureDefaultPayslipPreset(companyId: string, actor = 'SYSTEM_SEED'): Promise<void> {
  try {
    await seedDefaultPayslipPreset(companyId, actor)
  } catch (error) {
    console.error('[PAYSLIP_PRESET] Failed to ensure default preset (non-critical):', { companyId, error })
  }
}
