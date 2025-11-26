// src/app/lib/auth.ts
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

export type JwtPayload = {
  userId: string
  email: string
  role: string
  companyId?: string | null
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

export const requireAuth = (token: string | null) => {
  if (!token) throw new Error('Authentication required')

  const decoded = verifyToken(token)
  if (!decoded) throw new Error('Invalid or expired token')

  return decoded
}

export const requireRole = (token: string | null, allowedRoles: string[]) => {
  const user = requireAuth(token)

  if (!allowedRoles.includes(user.role)) {
    throw new Error('Insufficient permissions')
  }

  return user
}

export const requireCompany = (token: string | null) => {
  const user = requireAuth(token)
  if (!user.companyId) throw new Error('Company context missing')
  return user.companyId
}
