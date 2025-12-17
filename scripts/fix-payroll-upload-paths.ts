// scripts/fix-payroll-upload-paths.ts
import { prisma } from '@/app/lib/db'
import path from 'path'
import { existsSync } from 'fs'

async function fixUploadPaths() {
  console.log('Starting to fix payroll upload paths...')

  try {
    // Get all payroll uploads
    const uploads = await prisma.payrollUpload.findMany({
      where: {
        OR: [
          { filePath: { not: null } },
          { processedFilePath: { not: null } }
        ]
      },
      select: {
        id: true,
        filePath: true,
        processedFilePath: true,
        companyId: true,
        fileName: true
      }
    })

    console.log(`Found ${uploads.length} uploads to check`)

    let fixedCount = 0
    let errors = []

    for (const upload of uploads) {
      try {
        let updates: any = {}
        let needsUpdate = false

        // Helper function to normalize path
        const normalizePath = (filePath: string | null): string | null => {
          if (!filePath) return null
          
          // Remove project root if present
          if (filePath.includes(process.cwd())) {
            return filePath.replace(process.cwd() + path.sep, '')
          }
          
          // Handle Windows paths
          if (filePath.includes('\\')) {
            const normalized = filePath.replace(/\\/g, '/')
            
            // Check if it's an absolute Windows path like C:\...
            if (/^[A-Z]:/.test(normalized)) {
              // Extract just the path part after the drive letter
              const pathPart = normalized.substring(normalized.indexOf('/') + 1)
              return pathPart
            }
            
            return normalized
          }
          
          return filePath
        }

        // Fix filePath
        if (upload.filePath) {
          const normalizedPath = normalizePath(upload.filePath)
          if (normalizedPath !== upload.filePath) {
            updates.filePath = normalizedPath
            needsUpdate = true
            console.log(`Fixed filePath for ${upload.id}: ${upload.filePath} -> ${normalizedPath}`)
          }
        }

        // Fix processedFilePath
        if (upload.processedFilePath) {
          const normalizedPath = normalizePath(upload.processedFilePath)
          if (normalizedPath !== upload.processedFilePath) {
            updates.processedFilePath = normalizedPath
            needsUpdate = true
            console.log(`Fixed processedFilePath for ${upload.id}: ${upload.processedFilePath} -> ${normalizedPath}`)
          }
        }

        if (needsUpdate) {
          await prisma.payrollUpload.update({
            where: { id: upload.id },
            data: updates
          })
          fixedCount++
        }
      } catch (error) {
        console.error(`Error fixing upload ${upload.id}:`, error)
        errors.push({ id: upload.id, error: error.message })
      }
    }

    console.log(`\nSummary:`)
    console.log(`- Total uploads checked: ${uploads.length}`)
    console.log(`- Fixed: ${fixedCount}`)
    console.log(`- Errors: ${errors.length}`)
    
    if (errors.length > 0) {
      console.log('\nErrors:')
      errors.forEach(err => {
        console.log(`  - Upload ${err.id}: ${err.error}`)
      })
    }

    console.log('\nPath fixing completed!')
  } catch (error) {
    console.error('Error fixing paths:', error)
    throw error
  }
}

// Run the script
if (require.main === module) {
  fixUploadPaths()
    .then(() => {
      console.log('Migration script finished')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Migration script failed:', error)
      process.exit(1)
    })
}

export { fixUploadPaths }