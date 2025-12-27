// src/app/lib/auth.ts
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

export type JwtPayload = {
  userId: string
  email: string
  role: string
  companyId?: string | null
  permissions?: string[]
  sub?: string // For backward compatibility
}

export interface AuthUser {
  userId: string
  email: string
  role: string
  companyId?: string
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

export function getUserFromToken(token: string): AuthUser | null {
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

export const requireAuth = (token: string | null): AuthUser => {
  if (!token) throw new Error('Authentication required')

  const user = getUserFromToken(token)
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

// Function to create enhanced JWT payload with permissions
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