// src/app/lib/db.ts (Prisma 7 + Aiven SSL safe)
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import PrismaPkg from '@prisma/client'

// Relax Prisma typing to dodge the TS "no exported member" issue
type PrismaClient = any

// Grab the runtime PrismaClient constructor safely
const { PrismaClient: PrismaClientCtor } = PrismaPkg as any

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

// Shared pg Pool (good for Render/Aiven-style managed Postgres)
const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      // For Aiven/self-signed certs; if you ever switch, you can gate this
      rejectUnauthorized: false,
    },
  })

const adapter = new PrismaPg(pool)

// Single Prisma instance (dev reuse, prod fresh)
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClientCtor({
    adapter,
    log: ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.pool = pool
}
