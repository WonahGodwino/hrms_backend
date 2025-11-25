// scripts/seed.ts
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { PrismaClient } from '@prisma/client'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding HRMS multi-company database...')

  const master = await prisma.company.upsert({
    where: { slug: 'master' },
    update: {},
    create: {
      name: 'Master Company',
      slug: 'master',
    },
  })

  const acme = await prisma.company.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme HR Solutions',
      slug: 'acme',
    },
  })

  const beta = await prisma.company.upsert({
    where: { slug: 'beta' },
    update: {},
    create: {
      name: 'Beta Logistics',
      slug: 'beta',
    },
  })

  await prisma.staffRecord.upsert({
    where: { email: 'master.admin@example.com' },
    update: {},
    create: {
      email: 'master.admin@example.com',
      fullName: 'Master Admin',
      role: 'admin',
      companyId: master.id,
      isCompleted: false,
    },
  })

  await prisma.staffRecord.upsert({
    where: { email: 'acme.admin@example.com' },
    update: {},
    create: {
      email: 'acme.admin@example.com',
      fullName: 'Acme Admin',
      role: 'admin',
      companyId: acme.id,
      isCompleted: false,
    },
  })

  await prisma.staffRecord.upsert({
    where: { email: 'beta.admin@example.com' },
    update: {},
    create: {
      email: 'beta.admin@example.com',
      fullName: 'Beta Admin',
      role: 'admin',
      companyId: beta.id,
      isCompleted: false,
    },
  })

  console.log('✅ Seeding completed.')
}

main()
  .catch((err) => {
    console.error('❌ Seeding failed:')
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
