// src/app/lib/payroll/generateEnhancedPayslipPdf.ts
import PDFDocument from 'pdfkit'
import type { PayrollTemplateType } from './templates/types'

function formatCurrency(n: number) {
  // Ensure we always have a valid number
  const safe = Number.isFinite(n) ? n : 0
  // Format with proper naira sign and 2 decimal places
  return `₦${safe.toLocaleString('en-NG', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  })}`
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
    position?: string
    
    // BLUERIDGE specific fields
    overtimeIncome?: number
    communicationAllowance?: number
    outstandingIncome?: number
    dressingAllowance?: number
    leaveAllowance?: number
    entertainmentAllowance?: number
    utilityAllowance?: number
    
    // Additional fields from mapping
    proratedGrossPay?: number
    walletPayment?: number
    commercialPayment?: number
  }
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
  const { staff, payroll, companyInfo } = input
  
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
        .text('PAYSLIP', 40, 55)
      
      // Right side info - NO TEMPLATE DISPLAY
      doc.fillColor('#ffffff')
        .fontSize(10)
        .font('Helvetica')
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width - 250, 42, { width: 200, align: 'right' })
        .text(`Generated: ${new Date().toLocaleDateString('en-NG')}`, 
              doc.page.width - 250, 59, { width: 200, align: 'right' })

      // ===== STAFF INFORMATION SECTION =====
      const staffSectionTop = 120
      doc.roundedRect(40, staffSectionTop, doc.page.width - 80, 140, 6)
        .fill('#f3f6fb')
      
      doc.fillColor('#000000')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('EMPLOYEE INFORMATION', 55, staffSectionTop + 10)
        
      // Left column - Staff details
      doc.fontSize(10)
        .font('Helvetica')
        .text(`Staff ID: ${staff.staffId}`, 55, staffSectionTop + 30)
        .text(`Staff Name: ${staff.firstName} ${staff.lastName}`, 55, staffSectionTop + 47)
        .text(`Position: ${payroll.position || staff.position || staff.designation || 'N/A'}`, 55, staffSectionTop + 64)
        .text(`Department: ${staff.department || 'N/A'}`, 55, staffSectionTop + 81)
        .text(`Email: ${staff.email}`, 55, staffSectionTop + 98)
      
      // Right column - Attendance Info
      doc.text(`Number of days in the month: ${payroll.daysInMonth || 0}`, 
              doc.page.width / 2 + 10, staffSectionTop + 30)
        .text(`Number of days worked: ${payroll.daysWorked || 0}`, 
              doc.page.width / 2 + 10, staffSectionTop + 47)
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width / 2 + 10, staffSectionTop + 64)

      // ===== EARNINGS SECTION =====
      let currentY = staffSectionTop + 155
      
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

      // Map field values to display names based on the mapping table
      // ALL FIELDS SHOWN EVEN IF ZERO
      const earningsFields = [
        // Basic fields from mapping
        { displayName: 'Prorated Gross Pay', value: payroll.proratedGrossPay ?? payroll.basicSalary ?? 0 },
        { displayName: 'Overtime Income (OI)', value: payroll.overtimeIncome ?? 0 },
        { displayName: 'Communication Allowance (CA)', value: payroll.communicationAllowance ?? 0 },
        { displayName: 'Transportation Allowance (TA)', value: payroll.transportationAllowance ?? payroll.transportAllowance ?? 0 },
        { displayName: 'Outstanding Income (OI)', value: payroll.outstandingIncome ?? 0 },
        { displayName: 'Performance Bonus (PB)', value: payroll.bonusKPI ?? 0 },
        
        // Other allowances - always show with 0 if not present
        { displayName: 'Housing Allowance', value: payroll.housingAllowance ?? 0 },
        { displayName: 'Other Allowances', value: payroll.otherAllowances ?? 0 },
        { displayName: 'Dressing Allowance', value: payroll.dressingAllowance ?? 0 },
        { displayName: 'Leave Allowance', value: payroll.leaveAllowance ?? 0 },
        { displayName: 'Entertainment Allowance', value: payroll.entertainmentAllowance ?? 0 },
        { displayName: 'Utility Allowance', value: payroll.utilityAllowance ?? 0 },
      ];

      // Display ALL earnings fields (even zero values)
      earningsFields.forEach(field => {
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(field.displayName, 50, currentY)
          .text(formatCurrency(field.value), doc.page.width - 180, currentY, {
            width: 130,
            align: 'right'
          })
        currentY += 18
      });

      // Gross Salary
      currentY += 5
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#0f5132')
        .text('Gross Salary', 50, currentY)
        .text(formatCurrency(payroll.grossPay ?? 0), doc.page.width - 180, currentY, {
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

      // Deduction fields with display names from mapping - ALL SHOWN
      const deductionFields = [
        { displayName: 'Employee Pension Deduction', value: payroll.pension ?? 0 },
        { displayName: 'Payee', value: payroll.payee ?? 0 },
        { displayName: 'Other Deductions', value: payroll.deductions ?? 0 },
      ];

      let totalDeductions = 0
      
      // Display ALL deduction fields
      deductionFields.forEach(field => {
        totalDeductions += field.value
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(field.displayName, 50, currentY)
          .text(formatCurrency(field.value), doc.page.width - 180, currentY, {
            width: 130,
            align: 'right'
          })
        currentY += 18
      });

      // Total Deductions
      currentY += 5
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#8b0000')
        .text('TOTAL DEDUCTIONS', 50, currentY)
        .text(formatCurrency(totalDeductions), doc.page.width - 180, currentY, {
          width: 130,
          align: 'right'
        })

      // ===== NET SALARY SECTION =====
      currentY += 45
      
      doc.roundedRect(40, currentY, doc.page.width - 80, 60, 6)
        .fill('#e8f0ff')
      
      doc.fillColor('#0b1f44')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Net Salary', 55, currentY + 20)
      
      doc.fontSize(18)
        .text(formatCurrency(payroll.netPay ?? 0), doc.page.width - 220, currentY + 15, {
          width: 170,
          align: 'right'
        })

      // ===== PAYMENT DETAILS SECTION =====
      currentY += 75
      
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('PAYMENT DETAILS', 40, currentY)
      
      currentY += 20
      
      doc.moveTo(40, currentY)
        .lineTo(doc.page.width - 40, currentY)
        .stroke('#1e3a5f')
      
      currentY += 15

      // Payment method fields - ALL SHOWN
      const paymentFields = [
        { displayName: 'WALLET PAYMENT', value: payroll.walletPayment ?? 0 },
        { displayName: 'COMMERCIAL PAYMENT', value: payroll.commercialPayment ?? 0 },
      ];

      paymentFields.forEach(field => {
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(field.displayName, 50, currentY)
          .text(formatCurrency(field.value), doc.page.width - 180, currentY, {
            width: 130,
            align: 'right'
          })
        currentY += 18
      });

      // ===== ATTENDANCE SUMMARY =====
      currentY += 15
      
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

      // Page info - NO TEMPLATE REFERENCE
      doc.fontSize(7)
        .fillColor('#999999')
        .text(
          `Generated on ${new Date().toLocaleString('en-NG')} | Page 1 of 1`,
          40,
          doc.page.height - 25,
          { align: 'center', width: doc.page.width - 80 }
        )

      doc.end()
      
      console.log(`✅ Enhanced payslip PDF generated for ${staff.staffId}: ${fileName}`)
      
    } catch (error) {
      console.error('❌ Error generating enhanced payslip PDF:', error)
      reject(error)
    }
  })
}