// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
  var pgPool: Pool | undefined
}

/**
 * Detect Next.js build phase
 */
const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NODE_ENV === 'test' ||
  process.env.NEXT_PHASE === 'phase-production-server' // Added for build

function createPool() {
  if (!process.env.DATABASE_URL) {
    // During build time, return mock pool
    if (isBuildTime) {
      return {} as Pool
    }
    throw new Error('DATABASE_URL is not set')
  }

  let ssl: any = false

  if (process.env.NODE_ENV === 'production') {
    const caPath = path.join(process.cwd(), 'certs', 'aiven-ca.pem')

    ssl = fs.existsSync(caPath)
      ? {
          ca: fs.readFileSync(caPath, 'utf8'),
          rejectUnauthorized: false,
        }
      : { rejectUnauthorized: false }
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
  })
}

function createPrismaClient() {
  if (isBuildTime) {
    // Dummy proxy prevents crashes during build
    // But also provides basic mock functionality for build
    return new Proxy({} as PrismaClient, {
      get(target, prop) {
        // Allow certain properties during build
        if (prop === '$connect' || prop === '$disconnect' || prop === '$on') {
          return async () => {}
        }
        if (prop === '$use') {
          return () => {}
        }
        if (prop === '$extends') {
          return () => ({} as any)
        }
        
        // Return mock functions for model operations during build
        return async () => {
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              `⚠️ Prisma client accessed during build (${String(prop)}). ` +
              `Move DB calls inside request handlers or API routes.`
            )
          }
          
          // Return appropriate mock based on operation
          if (String(prop).startsWith('find')) return null
          if (String(prop).startsWith('count')) return 0
          if (String(prop).startsWith('create')) return {}
          if (String(prop).startsWith('update')) return {}
          if (String(prop).startsWith('delete')) return {}
          return []
        }
      },
    })
  }

  try {
    const pool = global.pgPool ?? createPool()
    const adapter = new PrismaPg(pool)
    
    // Don't set global.pgPool during build
    if (!isBuildTime) {
      global.pgPool = pool
    }

    return new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    })
  } catch (error) {
    console.error('Failed to create Prisma client:', error)
    
    // Fallback to standard PrismaClient without adapter
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Falling back to standard PrismaClient')
      return new PrismaClient({
        log: ['error', 'warn'],
      })
    }
    throw error
  }
}

/**
 * 🔥 BACKWARD COMPATIBLE EXPORT
 * 
 * This works with ALL existing APIs that import:
 * - import { prisma } from '@/app/lib/db'
 * - import { prisma } from '@/lib/prisma'
 * - import { prisma } from '@/app/lib/prisma'
 * 
 * Also works with new adapter setup
 */
export const prisma: PrismaClient = (() => {
  // Reuse existing global instance
  if (global.prisma) {
    return global.prisma
  }
  
  // Create new instance
  const client = createPrismaClient()
  
  // Store in global for reuse
  if (process.env.NODE_ENV !== 'production' || !isBuildTime) {
    global.prisma = client
  }
  
  return client
})()

// Default export for flexibility
export default prisma