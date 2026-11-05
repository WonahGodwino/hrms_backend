import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { getActiveElevatedRole, rankOf } from '@/app/lib/role-elevation'

export type JwtPayload = {
  userId: string
  email: string
  role: string
  companyId?: string | null // Current selected company
  companyIds?: string[] // All accessible companies for this user
  permissions?: string[]
  enabledModules?: string[] // Module keys enabled for this company
  deviceId?: string // Device row this token was issued against (Device Management)
  sub?: string
}

export interface AuthUser {
  userId: string
  email: string
  role: string
  companyId?: string // Current selected company
  companyIds?: string[] // All accessible companies
  permissions?: string[]
  deviceId?: string // Device row this token was issued against (Device Management)
}

export type SessionValidityCode = 'ACCOUNT_BLOCKED' | 'ACCOUNT_DEACTIVATED' | 'SESSION_CLEARED'

// Device Management — the one place a token gets checked against current DB
// state instead of trusted purely on signature. Called from getUserFromToken
// (so every route that resolves company assignments gets this for free) and
// directly from /auth/me and /auth/session-status (which need the specific
// code to tell the frontend why the session died).
export async function assertSessionValid(
  decoded: { userId?: string; sub?: string; deviceId?: string }
): Promise<{ valid: boolean; code?: SessionValidityCode }> {
  const staffId = decoded.userId || decoded.sub
  if (!staffId) return { valid: false, code: 'ACCOUNT_DEACTIVATED' }

  const staff = await prisma.staffRecord.findUnique({
    where: { id: staffId },
    select: { isActive: true, isBlocked: true }
  })

  if (!staff || !staff.isActive) return { valid: false, code: 'ACCOUNT_DEACTIVATED' }
  if (staff.isBlocked) return { valid: false, code: 'ACCOUNT_BLOCKED' }

  if (decoded.deviceId) {
    const device = await prisma.device.findUnique({
      where: { id: decoded.deviceId },
      select: { isActive: true, staffRecordId: true }
    })
    if (!device || device.staffRecordId !== staffId || !device.isActive) {
      return { valid: false, code: 'SESSION_CLEARED' }
    }
  }

  return { valid: true }
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function comparePassword(password: string, hashed: string) {
  return bcrypt.compare(password, hashed)
}

// type cast to avoid jsonwebtoken overload issues
export function signToken(payload: JwtPayload, expiresIn: string = '7d') {
  return (jwt as any).sign(payload, getJwtSecret(), { expiresIn }) as string
}

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload
  } catch {
    return null
  }
}

export async function getUserFromToken(token: string): Promise<AuthUser | null> {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any

    const sessionCheck = await assertSessionValid(decoded)
    if (!sessionCheck.valid) return null

    let companyIds: string[] = []
    let currentCompanyId: string | undefined = decoded.companyId

    // SUPER_ADMIN can access all companies
    if (decoded.role === 'SUPER_ADMIN') {
      const allCompanies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true }
      })
      companyIds = allCompanies.map(c => c.id)
      
      if (!currentCompanyId && companyIds.length > 0) {
        currentCompanyId = companyIds[0]
      }
    } 
    // For HR/ADMIN, fetch assigned companies from UserCompany table
    else if (decoded.role === 'HR' || decoded.role === 'ADMIN') {
      const userCompanies = await prisma.userCompany.findMany({
        where: { 
          userId: decoded.userId || decoded.sub,
          company: { archived: 0 }
        },
        select: { companyId: true }
      })
      
      companyIds = userCompanies.map(uc => uc.companyId)
      
      // Validate that currentCompanyId (if provided) is in user's companies
      if (currentCompanyId && !companyIds.includes(currentCompanyId)) {
        currentCompanyId = companyIds.length > 0 ? companyIds[0] : undefined
      } else if (!currentCompanyId && companyIds.length > 0) {
        currentCompanyId = companyIds[0]
      }
    } 
    // For STAFF, they only have their own company (from StaffRecord)
    else if (decoded.role === 'STAFF') {
      if (decoded.companyId) {
        companyIds = [decoded.companyId]
        currentCompanyId = decoded.companyId
      }
    }

    // Temporary role-elevation overlay: if this staff member has an ACTIVE
    // elevation in the current company, resolve the elevated role (only ever an
    // upgrade). The base role is never mutated, so revoking/expiring the
    // elevation returns them to their original role automatically. SUPER_ADMIN is
    // never overlaid (already top of the tree).
    let effectiveRole = decoded.role || 'STAFF'
    const staffId = decoded.userId || decoded.sub
    if (effectiveRole !== 'SUPER_ADMIN' && staffId && currentCompanyId) {
      const elevatedRole = await getActiveElevatedRole(staffId, currentCompanyId)
      if (elevatedRole && rankOf(elevatedRole) > rankOf(effectiveRole)) {
        effectiveRole = elevatedRole
        // Ensure the elevated company is in scope for company-access checks.
        if (!companyIds.includes(currentCompanyId)) companyIds.push(currentCompanyId)
      }
    }

    return {
      userId: decoded.userId || decoded.sub,
      email: decoded.email,
      role: effectiveRole,
      companyId: currentCompanyId,
      companyIds: companyIds.length > 0 ? companyIds : undefined,
      permissions: decoded.permissions || [],
      deviceId: decoded.deviceId
    }
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

export const requireAuth = (token: string | null): AuthUser => {
  if (!token) throw new Error('Authentication required')

  const user = getUserFromTokenSync(token)
  if (!user) throw new Error('Invalid or expired token')

  return user
}

// Synchronous version for backward compatibility
function getUserFromTokenSync(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any
    
    return {
      userId: decoded.userId || decoded.sub,
      email: decoded.email,
      role: decoded.role || 'STAFF',
      companyId: decoded.companyId,
      permissions: decoded.permissions || [],
      deviceId: decoded.deviceId
    }
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

// Async version for routes that need company assignments
const requireAuthAsync = async (token: string | null): Promise<AuthUser> => {
  if (!token) throw new Error('Authentication required')

  const user = await getUserFromToken(token)
  if (!user) throw new Error('Invalid or expired token')

  return user
}

export const requireRole = (token: string | null, allowedRoles: string[]): AuthUser => {
  const user = requireAuth(token)

  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`)
  }

  return user
}

// Async version with company assignments
export const requireRoleAsync = async (token: string | null, allowedRoles: string[]): Promise<AuthUser> => {
  const user = await requireAuthAsync(token)

  if (!allowedRoles.includes(user.role)) {
    throw new Error(`Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`)
  }

  return user
}

// Helper to check if user has access to a specific company
export async function checkCompanyAccess(userId: string, companyId: string, role?: string): Promise<boolean> {
  // SUPER_ADMIN has access to all companies
  if (role === 'SUPER_ADMIN') return true

  const userCompany = await prisma.userCompany.findFirst({
    where: {
      userId,
      companyId,
      ...(role && role !== 'SUPER_ADMIN' ? { role: { in: [role, 'ALL'] } } : {})
    }
  })

  return !!userCompany
}

// Function to create auth payload with company assignments
export async function createAuthPayloadWithCompanies(
  userId: string, 
  email: string, 
  role: string, 
  companyId?: string,
  permissions?: string[]
): Promise<JwtPayload> {
  let finalCompanyId = companyId
  let companyIds: string[] = []

  // For HR and ADMIN, fetch their assigned companies
  if (role === 'HR' || role === 'ADMIN') {
    const userCompanies = await prisma.userCompany.findMany({
      where: { 
        userId,
        company: { archived: 0 }
      },
      select: { companyId: true }
    })
    
    companyIds = userCompanies.map(uc => uc.companyId)
    
    if (!finalCompanyId && companyIds.length > 0) {
      finalCompanyId = companyIds[0]
    }
  }
  // SUPER_ADMIN gets all companies
  else if (role === 'SUPER_ADMIN') {
    const allCompanies = await prisma.company.findMany({
      where: { archived: 0 },
      select: { id: true }
    })
    companyIds = allCompanies.map(c => c.id)
    
    if (!finalCompanyId && companyIds.length > 0) {
      finalCompanyId = companyIds[0]
    }
  }

  return {
    userId,
    email,
    role,
    companyId: finalCompanyId || null,
    companyIds: companyIds.length > 0 ? companyIds : undefined,
    permissions: permissions || []
  }
}

