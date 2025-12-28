// scripts/migrate-company-fields.ts
import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  
  try {
    // Add columns via raw SQL
    await prisma.$executeRaw`
      ALTER TABLE companies 
      ADD COLUMN IF NOT EXISTS logo TEXT,
      ADD COLUMN IF NOT EXISTS "taxId" TEXT,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
    `
    
    console.log('✅ Added columns to companies table')
    
    // Update existing records
    const result = await prisma.$executeRaw`
      UPDATE companies 
      SET "updatedAt" = "createdAt" 
      WHERE "updatedAt" IS NULL;
    `
    
    console.log(`✅ Updated ${result} records`)
    
    // Optional: Make updatedAt NOT NULL
    // await prisma.$executeRaw`
    //   ALTER TABLE companies 
    //   ALTER COLUMN "updatedAt" SET NOT NULL;
    // `
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()