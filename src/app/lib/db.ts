// src/app/lib/db.ts (Prisma 7 + Aiven SSL safe)
import { PrismaClient } from 'prisma/prisma-client'   // ✅ use generated client path
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

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
      // Aiven/self-signed friendly; set DATABASE_SSL=false if you ever want it off
      rejectUnauthorized: false,
    },
  })

const adapter = new PrismaPg(pool)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.pool = pool
}
