// src/app/lib/payroll/payslip-utils.ts
import { prisma } from '@/app/lib/db'
import type { CustomFieldValue, PayslipDisplayItem } from './templates/types'

function normalizeSection(section?: string): string {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_')
}

function isCustomFieldValue(value: unknown): value is CustomFieldValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    'displayName' in candidate &&
    'dataType' in candidate &&
    'section' in candidate &&
    'showOnPayslip' in candidate
  )
}

export async function getPayslipWithDetails(payslipId: string) {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      payroll: {
        include: {
          staffRecord: true,
          template: true
        }
      },
      staffRecord: true,
      company: true
    }
  })

  if (!payslip) return null

  // If it's a dynamic template, extract custom fields for display
  let earnings: PayslipDisplayItem[] = []
  let deductions: PayslipDisplayItem[] = []
  
  if (payslip.payroll.templateType === 'DYNAMIC' && payslip.payroll.customFields) {
    const rawCustomFields = payslip.payroll.customFields
    if (typeof rawCustomFields !== 'object' || rawCustomFields === null || Array.isArray(rawCustomFields)) {
      return {
        ...payslip,
        earnings,
        deductions,
        isDynamic: payslip.payroll.templateType === 'DYNAMIC',
        templateName: payslip.payroll.template?.templateName
      }
    }

    Object.values(rawCustomFields).forEach((fieldValue) => {
      if (!isCustomFieldValue(fieldValue)) return
      const field = fieldValue
      if (!field.showOnPayslip) return
      
      const value = typeof field.value === 'number' 
        ? field.value 
        : Number(field.value) || 0
      
      if (value <= 0) return

      const normalizedSection = normalizeSection(field.section)

      const item: PayslipDisplayItem = {
        label: field.displayName,
        value,
        dataType: field.dataType,
        isCustom: true,
        section: normalizedSection,
        type: normalizedSection === 'DEDUCTIONS' ? 'deduction' : 'earnings'
      }

      if (normalizedSection === 'DEDUCTIONS') {
        deductions.push(item)
      } else {
        earnings.push(item)
      }
    })
  }

  return {
    ...payslip,
    earnings,
    deductions,
    isDynamic: payslip.payroll.templateType === 'DYNAMIC',
    templateName: payslip.payroll.template?.templateName
  }
}

// API endpoint to download payslip
export async function downloadPayslip(payslipId: string) {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId }
  })

  if (!payslip) return null

  // If fileData is stored in DB
  if (payslip.fileData) {
    return {
      data: payslip.fileData,
      fileName: payslip.fileName,
      fileType: payslip.fileType
    }
  }
  
  // If file is stored on disk
  if (payslip.filePath) {
    const fs = require('fs').promises
    const path = require('path')
    const fullPath = path.join(process.cwd(), payslip.filePath)
    const fileData = await fs.readFile(fullPath)
    
    return {
      data: fileData,
      fileName: payslip.fileName,
      fileType: payslip.fileType
    }
  }

  return null
}