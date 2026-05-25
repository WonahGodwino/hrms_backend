import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'

export type JwtPayload = {
  userId: string
  email: string
  role: string
  companyId?: string | null // Current selected company
  companyIds?: string[] // All accessible companies for this user
  permissions?: string[]
  enabledModules?: string[] // Module keys enabled for this company
  sub?: string
}

export interface AuthUser {
  userId: string
  email: string
  role: string
  companyId?: string // Current selected company
  companyIds?: string[] // All accessible companies
  permissions?: string[]
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
    
    return {
      userId: decoded.userId || decoded.sub,
      email: decoded.email,
      role: decoded.role || 'STAFF',
      companyId: currentCompanyId,
      companyIds: companyIds.length > 0 ? companyIds : undefined,
      permissions: decoded.permissions || []
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
      permissions: decoded.permissions || []
    }
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

// Async version for routes that need company assignments
export const requireAuthAsync = async (token: string | null): Promise<AuthUser> => {
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

// Original function for backward compatibility
export function createAuthPayload(
  userId: string, 
  email: string, 
  role: string, 
  companyId?: string, 
  permissions?: string[]
): JwtPayload {
  return {
    userId,
    email,
    role,
    companyId: companyId || null,
    permissions: permissions || []
  }
}

export const requireCompany = (token: string | null): string => {
  const user = requireAuth(token)
  if (!user.companyId) throw new Error('Company context missing')
  return user.companyId
}

export function checkPermission(user: AuthUser, requiredPermission: string): boolean {
  if (user.role === 'SUPER_ADMIN') {
    return true // SUPER_ADMIN has all permissions
  }
  
  if (!user.permissions) {
    return false
  }
  
  return user.permissions.includes(requiredPermission)
}

// Convenience function to check permissions directly from token
export const requirePermission = (token: string | null, requiredPermission: string): AuthUser => {
  const user = requireAuth(token)
  
  if (!checkPermission(user, requiredPermission)) {
    throw new Error(`Insufficient permissions. Required permission: ${requiredPermission}`)
  }
  
  return user
}

// ** New Functions for OTP and Attendance **

// Helper function to generate OTP
export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}

export async function verifyPassword(storedPassword: string, enteredPassword: string) {
  return bcrypt.compare(enteredPassword, storedPassword);
}
