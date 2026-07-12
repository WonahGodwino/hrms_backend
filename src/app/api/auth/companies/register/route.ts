// src/app/api/auth/companies/register/route.ts
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { isValidCurrencyCode, normalizeCurrencyCode } from '@/app/lib/currency'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { verifyToken } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { seedModuleAccessForCompany } from '@/app/lib/module-access'
import { deriveLocationPrefix } from '@/app/lib/companies/location-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Maps an arbitrary role label from the payload onto a canonical role.
// admins[] entries default to ADMIN when the label is unrecognised.
function normalizeRole(role: unknown): 'ADMIN' | 'HR' | 'MANAGER' | 'STAFF' {
  switch (String(role || '').trim().toUpperCase()) {
    case 'HR':
      return 'HR'
    case 'MANAGER':
      return 'MANAGER'
    case 'STAFF':
      return 'STAFF'
    case 'ADMIN':
    default:
      return 'ADMIN'
  }
}

// Location.name is required, but the registration form may omit it (it sends
// type/state/address). Fall back to an explicit name, then a "Type - State"
// label, then either part on its own. Returns '' when nothing is usable.
function deriveLocationName(loc: any): string {
  const explicit = String(loc?.name || '').trim()
  if (explicit) return explicit
  const type = String(loc?.type || '').trim()
  const state = String(loc?.state || '').trim()
  if (type && state) return `${type} - ${state}`
  return type || state || ''
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  const firstName = parts.shift() || fullName.trim()
  const lastName = parts.join(' ') || '-'
  return { firstName, lastName }
}

// Builds a unique, schema-valid department code from its name.
// Department.code is required and unique per company, but the payload only
// carries names, so we derive one and de-duplicate within the batch.
function buildDepartmentCode(name: string, used: Set<string>): string {
  const base = (name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) || 'DEPT')
  let code = base
  let i = 1
  while (used.has(code)) {
    code = `${base}${i++}`
  }
  used.add(code)
  return code
}

function generateStaffId(role: string, index: number): string {
  const prefix = role.toUpperCase().substring(0, 3)
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${index}${rand}`
}

function generateTempPassword(): string {
  // 12 url-safe chars, mixed case + digits.
  return crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 1. Authenticate — only SUPER_ADMIN may register companies
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return withCors(ApiResponse.error('Authorization token is required', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded = verifyToken(token)
    if (!decoded) {
      return withCors(ApiResponse.error('Invalid or expired token', 401), origin)
    }
    if (decoded.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Only SUPER_ADMIN can register companies', 403), origin)
    }

    const actor = decoded.email || decoded.userId || 'SUPER_ADMIN'

    // 2. Parse body
    const body = await request.json()
    const {
      companyName,
      tradingName,
      rcNumber,
      taxId,
      industry,
      email,
      phone,
      website,
      biography,
      fiscalYearStart,
      leaveYearStart,
      address,
      logo,
      baseCurrency,
      locations,
      departments,
      admins,
    } = body || {}

    // 3. Validate core required fields
    if (!companyName || !String(companyName).trim()) {
      return withCors(ApiResponse.error('Company name is required', 400), origin)
    }
    if (!email || !String(email).trim()) {
      return withCors(ApiResponse.error('Company email is required', 400), origin)
    }
    const cleanCompanyName = String(companyName).trim()
    const cleanEmail = String(email).toLowerCase().trim()
    if (!EMAIL_RE.test(cleanEmail)) {
      return withCors(ApiResponse.error('A valid company email is required', 400), origin)
    }
    const cleanTaxId = taxId ? String(taxId).trim() : null

    const normalizedBaseCurrency = baseCurrency ? String(baseCurrency).trim().toUpperCase() : 'NGN'
    if (!isValidCurrencyCode(normalizedBaseCurrency)) {
      return withCors(ApiResponse.error('Invalid baseCurrency. Use a valid ISO 4217 code', 400), origin)
    }

    // 4. Validate nested collections
    const locationsInput = Array.isArray(locations) ? locations : []
    for (const loc of locationsInput) {
      // A location must carry at least something identifying — the form may
      // omit an explicit name (it sends type/state/address), so we derive one.
      if (!loc || !deriveLocationName(loc)) {
        return withCors(ApiResponse.error('Each location requires a name, type or state', 400), origin)
      }
    }

    const departmentsInput = Array.isArray(departments) ? departments : []
    for (const dep of departmentsInput) {
      if (!dep || !String(dep.name || '').trim()) {
        return withCors(ApiResponse.error('Each department requires a name', 400), origin)
      }
    }

    const adminsInput = Array.isArray(admins) ? admins : []
    const seenAdminEmails = new Set<string>()
    for (const a of adminsInput) {
      const aEmail = String(a?.email || '').toLowerCase().trim()
      if (!a || !String(a.name || '').trim() || !aEmail) {
        return withCors(ApiResponse.error('Each admin requires a name and email', 400), origin)
      }
      if (!EMAIL_RE.test(aEmail)) {
        return withCors(ApiResponse.error(`Invalid admin email: ${a.email}`, 400), origin)
      }
      if (seenAdminEmails.has(aEmail)) {
        return withCors(ApiResponse.error(`Duplicate admin email: ${aEmail}`, 400), origin)
      }
      seenAdminEmails.add(aEmail)
    }

    // 5. Reject duplicate company
    const existingCompany = await prisma.company.findFirst({
      where: {
        OR: [
          { companyName: cleanCompanyName },
          { email: cleanEmail },
          ...(cleanTaxId ? [{ taxId: cleanTaxId }] : []),
        ],
      },
    })
    if (existingCompany) {
      let errorMessage = 'Company with similar details already exists'
      if (existingCompany.companyName === cleanCompanyName) {
        errorMessage = 'Company name already exists'
      } else if (existingCompany.email === cleanEmail) {
        errorMessage = 'Company email already exists'
      } else if (cleanTaxId && existingCompany.taxId === cleanTaxId) {
        errorMessage = 'Company tax ID already exists'
      }
      return withCors(ApiResponse.error(errorMessage, 409), origin)
    }

    // 6. Resolve admin records (hash passwords outside the transaction — bcrypt is slow)
    const resolvedAdmins = await Promise.all(
      adminsInput.map(async (a: any, index: number) => {
        const role = normalizeRole(a.role)
        const { firstName, lastName } = splitName(String(a.name))
        const providedPassword = a.password ? String(a.password) : null
        const tempPassword = providedPassword ? null : generateTempPassword()
        const plainPassword = providedPassword || (tempPassword as string)
        return {
          email: String(a.email).toLowerCase().trim(),
          firstName,
          lastName,
          role,
          staffId: generateStaffId(role, index),
          hashedPassword: await bcrypt.hash(plainPassword, 10),
          requirePasswordChange: !providedPassword,
          tempPassword, // only populated when we generated it
        }
      })
    )

    // Top-level address falls back to the first location's address (legacy contract).
    const resolvedAddress =
      (address && String(address).trim()) ||
      (locationsInput[0]?.address && String(locationsInput[0].address).trim()) ||
      null

    // 7. Create everything atomically
    const usedCodes = new Set<string>()
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          companyName: cleanCompanyName,
          tradingName: tradingName ? String(tradingName).trim() : null,
          rcNumber: rcNumber ? String(rcNumber).trim() : null,
          industry: industry ? String(industry).trim() : null,
          website: website ? String(website).trim() : null,
          biography: biography ? String(biography).trim() : null,
          fiscalYearStart: fiscalYearStart ? String(fiscalYearStart).trim() : null,
          leaveYearStart: leaveYearStart ? String(leaveYearStart).trim() : null,
          status: 'Active',
          address: resolvedAddress,
          phone: phone ? String(phone).trim() : null,
          email: cleanEmail,
          logo: logo ? String(logo).trim() : null,
          taxId: cleanTaxId,
          baseCurrency: normalizeCurrencyCode(normalizedBaseCurrency),
          createdBy: actor,
          archived: 0,
        },
      })

      if (locationsInput.length) {
        const locationCounters: Record<string, number> = {}
        await tx.location.createMany({
          data: locationsInput.map((loc: any) => {
            const prefix = deriveLocationPrefix(loc.state, deriveLocationName(loc))
            const n = (locationCounters[prefix] = (locationCounters[prefix] || 0) + 1)
            return {
              companyId: company.id,
              name: deriveLocationName(loc),
              code: `${prefix}-${String(n).padStart(3, '0')}`,
              type: loc.type ? String(loc.type).trim() : null,
              country: loc.country ? String(loc.country).trim() : null,
              state: loc.state ? String(loc.state).trim() : null,
              lga: loc.lga ? String(loc.lga).trim() : null,
              address: loc.address ? String(loc.address).trim() : null,
            }
          }) as any,
        })
      }

      if (departmentsInput.length) {
        await tx.department.createMany({
          data: departmentsInput.map((dep: any) => ({
            companyId: company.id,
            name: String(dep.name).trim(),
            code: buildDepartmentCode(String(dep.name), usedCodes),
            status: 'Active',
            activeHeadcount: 0,
          })),
        })
      }

      for (const a of resolvedAdmins) {
        const staff = await tx.staffRecord.create({
          data: {
            staffId: a.staffId,
            email: a.email,
            firstName: a.firstName,
            lastName: a.lastName,
            department: 'Administration',
            position: a.role,
            password: a.hashedPassword,
            isRegistered: true,
            isActive: true,
            requirePasswordChange: a.requirePasswordChange,
            role: a.role,
            companyId: company.id,
            createdBy: actor,
          },
        })

        // Login accounts for company-level roles get a UserCompany mapping.
        if (a.role === 'ADMIN' || a.role === 'HR' || a.role === 'MANAGER') {
          await tx.userCompany.create({
            data: {
              userId: staff.id,
              companyId: company.id,
              role: a.role,
              createdBy: actor,
            },
          })
        }
      }

      return company
    })

    // 8. Best-effort post-create seeding (non-fatal — does not roll back the company)
    try {
      await prisma.aISettings.create({
        data: {
          companyId: result.id,
          enabled: true,
          monthlyBudget: 100.0,
          costPerReview: 0.02,
          costAlertThreshold: 80,
          defaultService: 'openai',
          defaultModel: 'gpt-3.5-turbo',
          autoShortlistThreshold: 75,
          useForSeniorRoles: true,
          useForTechnicalRoles: true,
          useForManagerRoles: true,
          updatedBy: actor,
        },
      })
    } catch (aiError) {
      console.warn('⚠️ Could not create AI settings:', aiError)
    }

    try {
      await seedModuleAccessForCompany(result.id)
    } catch (moduleError) {
      console.warn('⚠️ Could not seed module access:', moduleError)
    }

    // 9. Respond
    return withCors(
      ApiResponse.success(
        {
          id: result.id,
          companyName: result.companyName,
          status: result.status,
          message: 'Company registered successfully',
          // Credentials for any admin accounts we provisioned. tempPassword is
          // only present when no password was supplied in the payload.
          admins: resolvedAdmins.map((a) => ({
            email: a.email,
            role: a.role,
            staffId: a.staffId,
            ...(a.tempPassword ? { tempPassword: a.tempPassword } : {}),
          })),
        },
        'Company registration successful'
      ),
      origin
    )
  } catch (error) {
    console.error('❌ Company registration error:', error)
    return withCors(handleApiError(error), origin)
  }
}
