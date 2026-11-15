// src/app/api/payroll/upload/validate/route.ts
//
// Dry run for the payroll upload drawer. Parses and validates the file with the
// same code the import uses and returns the result. Writes nothing.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { isValidTemplateType, type PayrollTemplateType } from '@/app/lib/payroll/templates/types'
import { getActivePayrollUpload, validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { findCompanyDisabledCodesInUse } from '@/app/lib/staff/pension-fields'
import { MAX_PAYROLL_UPLOAD_BYTES } from '@/app/lib/payroll/upload/parse'
import { toValidationResponse } from '@/app/lib/payroll/upload/validate'
import { hashUpload, parseAndValidatePayroll, parseExpectedPeriod } from '@/app/lib/payroll/upload/run'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const fail = (message: string, status: number) => withCors(ApiResponse.error(message, status), origin)

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return fail('Authorization header missing', 401)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null
    const templateId = formData.get('templateId') as string | null
    const overwriteExisting = formData.get('overwriteExisting') === 'true'
    const expectedPeriod = parseExpectedPeriod(formData.get('expectedMonth'), formData.get('expectedYear'))

    let templateType = (new URL(request.url).searchParams.get('type') || formData.get('templateType')) as PayrollTemplateType | null
    if (!templateType || !isValidTemplateType(templateType)) {
      if (templateId) templateType = 'DYNAMIC'
      else return fail('Valid template type or template ID is required.', 400)
    }
    if (!companyId) return fail('Company selection is required', 400)

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    if (!(await validatePayrollCompanyAccess(user, companyId, userRole))) {
      return fail(`You do not have ${userRole} access for this company`, 403)
    }
    const company = await prisma.company.findFirst({ where: { id: companyId, archived: 0 }, select: { id: true, companyName: true } })
    if (!company) return fail('Company not found or is archived', 404)

    if (templateType === 'DYNAMIC') {
      const exists = templateId
        ? await prisma.payrollTemplate.findFirst({ where: { id: templateId, OR: [{ companyId }, { isSystem: true }] }, select: { id: true } })
        : null
      if (!exists) return fail('Dynamic template not found or not accessible', 404)
    }

    if (!file) return fail('File is required', 400)
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || ''
    const isCsv = fileExtension === 'csv' || file.type === 'text/csv'
    if (!['xlsx', 'xls'].includes(fileExtension) && !isCsv) {
      return fail('Invalid file format. Please upload an Excel (.xlsx) or CSV (.csv) file.', 400)
    }
    if (file.size > MAX_PAYROLL_UPLOAD_BYTES) {
      return fail(`This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Upload a file smaller than ${MAX_PAYROLL_UPLOAD_BYTES / 1024 / 1024} MB.`, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let result
    try {
      result = await parseAndValidatePayroll({ templateType, templateId, companyId, buffer, fileExtension, overwriteExisting, expectedPeriod })
    } catch (parseError: any) {
      return fail(parseError?.message || 'Failed to parse file. Please check the file format.', 400)
    }

    // Company-level blockers the import would also refuse on.
    const blockers: { code: string; message: string; disabledPfaInUse?: unknown }[] = []
    if (await getActivePayrollUpload(companyId)) {
      blockers.push({ code: 'UPLOAD_IN_PROGRESS', message: 'A payroll upload is already being processed for this company. Wait for it to finish before uploading another file.' })
    }
    const disabledPfaGroups = await findCompanyDisabledCodesInUse(companyId)
    if (disabledPfaGroups.length > 0) {
      const affected = disabledPfaGroups.flatMap((g) => g.staff)
      blockers.push({
        code: 'DISABLED_PFA_IN_USE',
        message: `${affected.length} staff member${affected.length === 1 ? '' : 's'} currently use a PFA code this company has disabled. Update their PFA code before uploading payroll.`,
        disabledPfaInUse: affected,
      })
    }

    return withCors(
      ApiResponse.success(
        { ...toValidationResponse(result, { fileName: file.name, companyName: company.companyName, fileHash: hashUpload(buffer) }), blockers },
        'Validation complete'
      ),
      origin
    )
  } catch (error) {
    console.error('[PAYROLL_UPLOAD_VALIDATE] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
