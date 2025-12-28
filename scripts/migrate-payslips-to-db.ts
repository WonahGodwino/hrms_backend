/*
// scripts/migrate-simple-fs.ts
import fs from 'fs/promises'
import path from 'path'

async function scanAndListFiles() {
  console.log('📁 Scanning for payslip files...')
  
  const uploadsDir = path.join(process.cwd(), 'uploads', 'payslips')
  
  try {
    const files = await fs.readdir(uploadsDir)
    
    console.log(`📊 Found ${files.length} files in uploads/payslips/`)
    console.log('\nFirst 20 files:')
    console.log('='.repeat(60))
    
    files.slice(0, 20).forEach((file, i) => {
      const filePath = path.join(uploadsDir, file)
      const stats = fs.statSync(filePath)
      console.log(`${i + 1}. ${file} - ${stats.size} bytes`)
    })
    
    console.log('\n📝 Sample file names for database query:')
    console.log('='.repeat(60))
    
    files.slice(0, 10).forEach(file => {
      // Extract info from filename
      const match = file.match(/payslip-(.+?)-(\d+)-(\d+)/)
      if (match) {
        const [, staffId, month, year] = match
        console.log(`Staff: ${staffId}, Month: ${month}, Year: ${year} -> ${file}`)
      }
    })
    
  } catch (error) {
    console.error('Error reading uploads directory:', error)
    console.log('Checking alternative locations...')
    
    // Try other locations
    const locations = [
      path.join(process.cwd(), 'uploads'),
      path.join(process.cwd(), 'public', 'uploads'),
      path.join(process.cwd(), 'public')
    ]
    
    for (const location of locations) {
      try {
        await fs.access(location)
        const files = await fs.readdir(location)
        console.log(`Found ${files.length} files in ${path.relative(process.cwd(), location)}`)
      } catch {
        continue
      }
    }
  }
}

scanAndListFiles()
**/