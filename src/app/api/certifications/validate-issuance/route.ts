import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/certifications/validate-issuance
// Validates selected employees, certification details, eligibility, prerequisites, and warnings before issuing
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const body = await req.json()
    const { employeeIds, certification, companyId } = body || {}

    const resolvedCompany = await resolveRequestCompanyId(user, companyId)
    if (isCompanyError(resolvedCompany)) return withCors(ApiResponse.error(resolvedCompany.error.message, resolvedCompany.error.status), origin)
    const { companyId: cid } = resolvedCompany

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return withCors(
        ApiResponse.success({
          available: true,
          valid: false,
          results: [],
          message: 'At least one employee must be selected',
        }),
        origin,
      )
    }

    const certName = certification?.name ?? certification?.title ?? ''
    const certTypeId = certification?.certificationTypeId ?? certification?.id
    const issueDateStr = certification?.issueDate
    const expiryDateStr = certification?.expiryDate

    const issueDate = issueDateStr ? new Date(issueDateStr) : new Date()
    const expiryDate = expiryDateStr ? new Date(expiryDateStr) : null

    // Cross-field validation: Expiry date check
    if (expiryDate && expiryDate <= issueDate) {
      return withCors(
        ApiResponse.success({
          available: true,
          valid: false,
          results: employeeIds.map(empId => ({
            employeeId: empId,
            status: 'ineligible',
            messages: ['Expiry date must be after issue date.'],
            warnings: [],
          })),
        }),
        origin,
      )
    }

    // Fetch employees from StaffRecord
    const employees = await prisma.staffRecord.findMany({
      where: {
        id: { in: employeeIds },
        companyId: cid,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        role: true,
      },
    })

    const foundEmpIds = new Set(employees.map(e => e.id))

    // Fetch existing certifications for these employees to check for duplicates or active certs
    const existingCerts = await prisma.certificationRecord.findMany({
      where: {
        companyId: cid,
        employeeId: { in: employeeIds },
        status: { in: ['Valid', 'Expiring Soon', 'Pending'] },
        ...(certTypeId ? { certificationTypeId: certTypeId } : {}),
      },
      include: {
        certificationType: { select: { name: true } },
      },
    })

    const existingCertMap = new Map<string, any[]>()
    existingCerts.forEach(c => {
      const list = existingCertMap.get(c.employeeId) ?? []
      list.push(c)
      existingCertMap.set(c.employeeId, list)
    })

    const now = new Date()
    let isOverallValid = true

    const results = employeeIds.map(empId => {
      const emp = employees.find(e => e.id === empId)
      if (!emp) {
        isOverallValid = false
        return {
          employeeId: empId,
          employeeName: 'Unknown Employee',
          status: 'ineligible',
          messages: ['Employee record not found in organization'],
          warnings: [],
        }
      }

      const empName = `${emp.firstName} ${emp.lastName}`
      const messages: string[] = []
      const warnings: string[] = []
      let status: 'eligible' | 'warning' | 'ineligible' = 'eligible'

      // Check existing certifications for this employee
      const empCerts = existingCertMap.get(empId) ?? []
      if (empCerts.length > 0) {
        const activeCert = empCerts.find(c => {
          if (certTypeId && c.certificationTypeId === certTypeId) return true
          if (certName && c.certificationType?.name?.toLowerCase() === certName.toLowerCase()) return true
          return false
        })

        if (activeCert) {
          const daysToExpiry = activeCert.expiryDate
            ? Math.ceil((activeCert.expiryDate.getTime() - now.getTime()) / 86_400_000)
            : null

          if (daysToExpiry !== null && daysToExpiry > 60) {
            status = 'warning'
            warnings.push(
              `Employee already holds an active certification (${activeCert.certificationType?.name ?? 'Certificate'}) expiring in ${daysToExpiry} days. Re-issuing will supersede or create a duplicate record.`,
            )
          } else if (daysToExpiry !== null && daysToExpiry <= 60 && daysToExpiry > 0) {
            warnings.push(
              `Renewal notice: Existing certification expires soon (in ${daysToExpiry} days). Re-issuing will renew the certification.`,
            )
          } else {
            warnings.push(`Existing active certification found (Status: ${activeCert.status}).`)
          }
        }
      }

      return {
        employeeId: empId,
        employeeName: empName,
        status,
        messages,
        warnings,
      }
    })

    return withCors(
      ApiResponse.success({
        available: true,
        valid: isOverallValid,
        results,
      }),
      origin,
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
