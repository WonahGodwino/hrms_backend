import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'

function buildConnectionString(): string {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
  }
  const databaseUrl = new URL(process.env.DATABASE_URL)
  databaseUrl.searchParams.delete('sslmode')
  databaseUrl.searchParams.delete('ssl')
  databaseUrl.searchParams.delete('sslinline')
  return databaseUrl.toString()
}

async function main() {
  const caPath = path.join(process.cwd(), 'certs', 'aiven-ca.pem')
  const pool = new Pool({
    connectionString: buildConnectionString(),
    ssl: fs.existsSync(caPath)
      ? { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: false }
      : { rejectUnauthorized: false },
  })

  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  const now = new Date()

  const internalWhere = {
    company: { archived: 0 },
  }

  const publicWhere = {
    status: 'ACTIVE' as const,
    company: { archived: 0 },
    OR: [{ expirationDate: { gte: now } }, { expirationDate: null }],
  }

  try {
    const [internalTotal, internalActive, publicTotal, activeExpired, activeNoExpiry, activeFuture] = await Promise.all([
      prisma.job.count({ where: internalWhere }),
      prisma.job.count({ where: { ...internalWhere, status: 'ACTIVE' } }),
      prisma.job.count({ where: publicWhere }),
      prisma.job.count({ where: { status: 'ACTIVE', company: { archived: 0 }, expirationDate: { lt: now } } }),
      prisma.job.count({ where: { status: 'ACTIVE', company: { archived: 0 }, expirationDate: null } }),
      prisma.job.count({ where: { status: 'ACTIVE', company: { archived: 0 }, expirationDate: { gte: now } } }),
    ])

    const byCompanyActive = await prisma.job.groupBy({
      by: ['companyId'],
      where: { status: 'ACTIVE', company: { archived: 0 } },
      _count: { _all: true },
    })

    console.log(
      JSON.stringify(
        {
          now: now.toISOString(),
          internalTotal,
          internalActive,
          publicTotal,
          activeExpired,
          activeNoExpiry,
          activeFuture,
          byCompanyActive,
        },
        null,
        2
      )
    )
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
