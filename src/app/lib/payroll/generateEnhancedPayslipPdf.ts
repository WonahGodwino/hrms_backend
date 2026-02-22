// src/app/lib/payroll/generateEnhancedPayslipPdf.ts
import PDFDocument from 'pdfkit'
import type { PayrollTemplateType } from './templates/types'
import { PAYROLL_TEMPLATES } from './templates/types'

function formatCurrency(n: number) {
  const safe = Number.isFinite(n) ? n : 0
  return `₦${safe.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
}

function getMonthName(monthNumber: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  return months[monthNumber - 1] || 'Unknown'
}

export interface GeneratePayslipInput {
  staff: {
    staffId: string
    firstName: string
    lastName: string
    email: string
    department: string
    designation: string
    position: string
    companyName: string
    companyAddress: string
    companyPhone: string
    companyLogo?: string
    companyTaxId?: string
  }
  payroll: {
    rowNumber: number
    staffId: string
    email: string
    fullName: string
    periodMonth: number
    periodYear: number
    basicSalary: number
    housingAllowance: number
    transportAllowance: number
    transportationAllowance: number
    otherAllowances: number
    grossPay: number
    payee: number
    pension: number
    netPay: number
    daysInMonth: number
    daysWorked: number
    rawRow: any
    bonusKPI?: number
    deductions?: number
    
    // BLUERIDGE specific fields
    overtimeIncome?: number
    communicationAllowance?: number
    outstandingIncome?: number
    dressingAllowance?: number
    leaveAllowance?: number
    entertainmentAllowance?: number
    utilityAllowance?: number
  }
  templateType?: PayrollTemplateType
  companyInfo?: {
    name: string
    address: string
    phone: string
    email: string
    logo?: string
    taxId?: string
  }
}

export async function generateEnhancedPayslipPdf(
  input: GeneratePayslipInput
): Promise<{ pdfBuffer: Uint8Array; fileName: string }> {
  const { staff, payroll, templateType = 'ISURF_STANDARD', companyInfo } = input
  const template = PAYROLL_TEMPLATES[templateType]
  
  const fileName = `payslip-${staff.staffId}-${payroll.periodMonth.toString().padStart(2, '0')}-${payroll.periodYear}.pdf`

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' })
      const chunks: Buffer[] = []
      
      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const pdfBuffer = new Uint8Array(buffer)
        resolve({
          pdfBuffer,
          fileName
        })
      })
      
      doc.on('error', reject)

      // ===== HEADER SECTION =====
      doc.rect(0, 0, doc.page.width, 100).fill('#1e3a5f')
      
      // Company Name and Title
      doc.fillColor('#ffffff')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(companyInfo?.name || staff.companyName || 'COMPANY NAME LTD', 40, 25)
      
      doc.fontSize(14)
        .font('Helvetica')
        .text(template.payslipTitle, 40, 55)
      
      // Right side info
      doc.fillColor('#ffffff')
        .fontSize(10)
        .font('Helvetica')
        .text(`Template: ${template.name}`, 
              doc.page.width - 250, 25, { width: 200, align: 'right' })
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width - 250, 42, { width: 200, align: 'right' })
        .text(`Generated: ${new Date().toLocaleDateString('en-NG')}`, 
              doc.page.width - 250, 59, { width: 200, align: 'right' })

      // ===== STAFF INFORMATION SECTION =====
      const staffSectionTop = 120
      doc.roundedRect(40, staffSectionTop, doc.page.width - 80, 100, 6)
        .fill('#f3f6fb')
      
      doc.fillColor('#000000')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('EMPLOYEE INFORMATION', 55, staffSectionTop + 10)
        
      // Left column
      doc.fontSize(10)
        .font('Helvetica')
        .text(`Name: ${staff.firstName} ${staff.lastName}`, 55, staffSectionTop + 30)
        .text(`Staff ID: ${staff.staffId}`, 55, staffSectionTop + 47)
        .text(`Email: ${staff.email}`, 55, staffSectionTop + 64)
        .text(`Department: ${staff.department || 'N/A'}`, 55, staffSectionTop + 81)
      
      // Right column
      doc.text(`Position: ${staff.position || staff.designation || 'N/A'}`, 
              doc.page.width / 2 + 10, staffSectionTop + 30)
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width / 2 + 10, staffSectionTop + 47)
        .text(`Days in Month: ${payroll.daysInMonth || 0}`, 
              doc.page.width / 2 + 10, staffSectionTop + 64)
        .text(`Days Worked: ${payroll.daysWorked || 0}`, 
              doc.page.width / 2 + 10, staffSectionTop + 81)

      // ===== EARNINGS SECTION =====
      let currentY = staffSectionTop + 125
      
      // Section header
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('EARNINGS', 40, currentY)
      
      currentY += 20
      
      // Header line
      doc.moveTo(40, currentY)
        .lineTo(doc.page.width - 40, currentY)
        .stroke('#1e3a5f')
      
      currentY += 15

      // Column headers
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text('Description', 50, currentY)
        .text('Amount', doc.page.width - 180, currentY, { width: 130, align: 'right' })
      
      currentY += 20

      // Map field values
      const fieldValues: Record<string, number> = {
        basicSalary: payroll.basicSalary || 0,
        housingAllowance: payroll.housingAllowance || 0,
        transportAllowance: payroll.transportAllowance || 0,
        transportationAllowance: payroll.transportationAllowance || 0,
        otherAllowances: payroll.otherAllowances || 0,
        overtimeIncome: payroll.overtimeIncome || 0,
        communicationAllowance: payroll.communicationAllowance || 0,
        outstandingIncome: payroll.outstandingIncome || 0,
        bonusKPI: payroll.bonusKPI || 0,
        dressingAllowance: payroll.dressingAllowance || 0,
        leaveAllowance: payroll.leaveAllowance || 0,
        entertainmentAllowance: payroll.entertainmentAllowance || 0,
        utilityAllowance: payroll.utilityAllowance || 0
      }

      // Display earnings based on template configuration
      template.displaySections.earnings.forEach(item => {
        const value = fieldValues[item.sourceField] || 0
        if (value > 0 || !item.conditional) {
          doc.fontSize(10)
            .font('Helvetica')
            .fillColor('#000000')
            .text(item.displayName, 50, currentY)
            .text(formatCurrency(value), doc.page.width - 180, currentY, {
              width: 130,
              align: 'right'
            })
          currentY += 18
        }
      })

      // Gross Pay
      currentY += 5
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#0f5132')
        .text('GROSS PAY', 50, currentY)
        .text(formatCurrency(payroll.grossPay || 0), doc.page.width - 180, currentY, {
          width: 130,
          align: 'right'
        })

      // ===== DEDUCTIONS SECTION =====
      currentY += 35
      
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#8b0000')
        .text('DEDUCTIONS', 40, currentY)
      
      currentY += 20
      
      doc.moveTo(40, currentY)
        .lineTo(doc.page.width - 40, currentY)
        .stroke('#8b0000')
      
      currentY += 15

      // Column headers
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text('Description', 50, currentY)
        .text('Amount', doc.page.width - 180, currentY, { width: 130, align: 'right' })
      
      currentY += 20

      // Deduction values
      const deductionValues: Record<string, number> = {
        payee: payroll.payee || 0,
        pension: payroll.pension || 0,
        deductions: payroll.deductions || 0
      }

      // Display deductions based on template configuration
      let totalDeductions = 0
      template.displaySections.deductions.forEach(item => {
        const value = deductionValues[item.sourceField] || 0
        totalDeductions += value
        if (value > 0 || !item.conditional) {
          doc.fontSize(10)
            .font('Helvetica')
            .fillColor('#000000')
            .text(item.displayName, 50, currentY)
            .text(formatCurrency(value), doc.page.width - 180, currentY, {
              width: 130,
              align: 'right'
            })
          currentY += 18
        }
      })

      // Total Deductions
      if (template.displaySections.deductions.length > 0) {
        currentY += 5
      }
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#8b0000')
        .text('TOTAL DEDUCTIONS', 50, currentY)
        .text(formatCurrency(totalDeductions), doc.page.width - 180, currentY, {
          width: 130,
          align: 'right'
        })

      // ===== NET PAY SECTION =====
      currentY += 45
      
      doc.roundedRect(40, currentY, doc.page.width - 80, 60, 6)
        .fill('#e8f0ff')
      
      doc.fillColor('#0b1f44')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('NET PAY', 55, currentY + 20)
      
      doc.fontSize(18)
        .text(formatCurrency(payroll.netPay || 0), doc.page.width - 220, currentY + 15, {
          width: 170,
          align: 'right'
        })

      // ===== ATTENDANCE SUMMARY =====
      currentY += 75
      
      doc.fontSize(9)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`Attendance Summary: ${payroll.daysWorked || 0} days worked out of ${payroll.daysInMonth || 0} days`, 
              40, currentY, { width: doc.page.width - 80, align: 'center' })

      // ===== FOOTER SECTION =====
      const footerY = doc.page.height - 50
      
      // Company contact info
      doc.fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text(
          `${companyInfo?.name || staff.companyName} | ${companyInfo?.address || staff.companyAddress || ''} | Tel: ${companyInfo?.phone || staff.companyPhone || ''}`,
          40,
          footerY,
          { align: 'center', width: doc.page.width - 80 }
        )

      // Disclaimer
      doc.fontSize(7)
        .fillColor('#999999')
        .text(
          'This is a computer-generated document. No signature is required.',
          40,
          footerY + 15,
          { align: 'center', width: doc.page.width - 80 }
        )

      // Page info
      doc.fontSize(7)
        .fillColor('#999999')
        .text(
          `Generated on ${new Date().toLocaleString('en-NG')} | Template: ${template.name} | Page 1 of 1`,
          40,
          doc.page.height - 25,
          { align: 'center', width: doc.page.width - 80 }
        )

      doc.end()
      
      console.log(`✅ Enhanced payslip PDF generated for ${staff.staffId}: ${fileName} (${template.name})`)
      
    } catch (error) {
      console.error('❌ Error generating enhanced payslip PDF:', error)
      reject(error)
    }
  })
}