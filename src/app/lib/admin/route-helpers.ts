// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).
import { prisma } from '@/app/lib/db'
import validator from 'validator'

type AuthUser = {
  userId: string
  role: string
  companyId?: string
}

export function computeDelta(a: number | null, b: number | null): { absolute: number; percent: number } {
  const aVal = a ?? 0
  const bVal = b ?? 0
  const absolute = Number((aVal - bVal).toFixed(1))
  if (bVal === 0) return { absolute, percent: aVal === 0 ? 0 : 100 }
  return { absolute, percent: Number(((absolute / bVal) * 100).toFixed(2)) }
}

export async function getAccessibleCompanyIds(user: AuthUser): Promise<string[]> {
  if (user.role === 'SUPER_ADMIN') {
    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      select: { id: true }
    })
    return companies.map((item) => item.id)
  }

  const assignments = await prisma.userCompany.findMany({
    where: {
      userId: user.userId,
      company: { archived: 0 }
    },
    select: { companyId: true },
    distinct: ['companyId']
  })

  if (assignments.length > 0) {
    return assignments.map((item) => item.companyId)
  }

  if (!user.companyId) return []

  const fallback = await prisma.company.findFirst({
    where: {
      id: user.companyId,
      archived: 0
    },
    select: { id: true }
  })

  return fallback ? [fallback.id] : []
}

export function pickTargetCompanyId(user: AuthUser, accessibleCompanyIds: string[], requestedCompanyId: string | null): string {
  if (requestedCompanyId) {
    if (!accessibleCompanyIds.includes(requestedCompanyId)) {
      throw new Error('Access denied to selected company')
    }
    return requestedCompanyId
  }

  if (user.role === 'SUPER_ADMIN' && accessibleCompanyIds.length > 1) {
    throw new Error('companyId is required for SUPER_ADMIN when managing multiple companies')
  }

  if (accessibleCompanyIds.length === 0) {
    throw new Error('No companies assigned to your account')
  }

  return accessibleCompanyIds[0]
}

export function sanitizeString(input: string | null): string | null {
	if (!input) return null;
	return validator.escape(validator.stripLow(input.trim()));
}
