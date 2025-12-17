// scripts/ensure-uploads.ts
import fs from 'fs/promises'
import path from 'path'

async function ensureUploadsDirectories() {
  const baseDir = process.cwd()
  const directories = [
    'uploads',
    'uploads/payroll',
    'uploads/payslips',
    'uploads/candidates',
    'public/uploads',
    'public/uploads/payroll',
    'public/uploads/payslips'
  ]

  for (const dir of directories) {
    const fullPath = path.join(baseDir, dir)
    try {
      await fs.mkdir(fullPath, { recursive: true })
      console.log(`✓ Created directory: ${dir}`)
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        console.error(`✗ Error creating ${dir}:`, error.message)
      }
    }
  }
}

ensureUploadsDirectories(