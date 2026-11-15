// src/app/lib/payroll/upload/run.ts
//
// Parse + validate an uploaded payroll file in one call. Used by the dry-run
// endpoint and by the upload POST (to enforce the "already sent" confirmation
// before anything is accepted).
import { createHash } from 'crypto'
import { prisma } from '@/app/lib/db'
import { parsePayrollFile, type PayrollTemplateKind } from './parse'
import { validatePayrollRows, type PayrollPeriod, type PayrollValidationResult } from './validate'

export function hashUpload(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Parses `expectedMonth` / `expectedYear` form values; null when absent or out of range. */
export function parseExpectedPeriod(month: unknown, year: unknown): PayrollPeriod | null {
  const m = typeof month === 'string' && /^\d{1,2}$/.test(month) ? parseInt(month, 10) : NaN
  const y = typeof year === 'string' && /^\d{4}$/.test(year) ? parseInt(year, 10) : NaN
  if (!(m >= 1 && m <= 12) || !(y >= 1900 && y <= 2200)) return null
  return { month: m, year: y }
}

export interface ParseAndValidateArgs {
  templateType: PayrollTemplateKind
  templateId?: string | null
  companyId: string
  buffer: Buffer
  fileExtension: string
  overwriteExisting: boolean
  expectedPeriod?: PayrollPeriod | null
}

export async function parseAndValidatePayroll(args: ParseAndValidateArgs): Promise<PayrollValidationResult> {
  const template =
    args.templateType === 'DYNAMIC' && args.templateId
      ? await prisma.payrollTemplate.findFirst({
          where: { id: args.templateId, OR: [{ companyId: args.companyId }, { isSystem: true }] },
          include: { fields: { orderBy: { order: 'asc' } } },
        })
      : null

  const parsed = await parsePayrollFile({
    kind: args.templateType,
    buffer: args.buffer,
    fileExtension: args.fileExtension,
    templateFields: template?.fields,
  })

  return validatePayrollRows({
    kind: args.templateType,
    rows: parsed.rows,
    headers: parsed.headers,
    unknownColumns: parsed.unknownColumns,
    companyId: args.companyId,
    template,
    expectedPeriod: args.expectedPeriod,
    overwriteExisting: args.overwriteExisting,
  })
}
