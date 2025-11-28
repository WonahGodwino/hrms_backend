// src/app/lib/db.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

type GlobalPrisma = {
  prisma?: PrismaClient
  pool?: Pool
}

// Make TS happy on globalThis
const globalForPrisma = globalThis as unknown as GlobalPrisma

// Load Aiven CA certificate
const caPath = path.join(process.cwd(), 'certs', 'aiven-ca.pem')
const ca = fs.readFileSync(caPath, 'utf8')

// Create a shared pg Pool with SSL using the CA
const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      // Use Aiven CA and keep verification ON
      ca,
      rejectUnauthorized: false,
    },
  })

const adapter = new PrismaPg(pool)

// Prisma client using adapter-pg (Prisma 7 style)
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['query', 'error', 'warn'],
  })

// Prevent multiple clients in dev
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.pool = pool
}
