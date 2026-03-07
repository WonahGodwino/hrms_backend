// src/app/lib/payroll/generateEnhancedPayslipPdf.ts
import PDFDocument from 'pdfkit'
import type { PayrollTemplateType } from './templates/types'

function formatCurrency(n: number) {
  const safe = Number.isFinite(n) ? n : 0
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
      const doc = new PDFDocument({ 
        margin: 40, 
        size: 'A4',
        bufferPages: true // Important for page management
      })
      
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

      // ===== HELPER FUNCTION TO CHECK PAGE SPACE =====
      const checkPageSpace = (neededSpace: number): boolean => {
        const currentY = doc.y
        const pageBottom = doc.page.height - 80 // Leave room for footer
        return currentY + neededSpace <= pageBottom
      }

      // ===== HEADER SECTION =====
      doc.rect(0, 0, doc.page.width, 100).fill('#1e3a5f')
      
      doc.fillColor('#ffffff')
        .fontSize(20)
        .font('Helvetica-Bold')
        .text(companyInfo?.name || staff.companyName || 'COMPANY NAME LTD', 40, 25)
      
      doc.fontSize(14)
        .font('Helvetica')
        .text('PAYSLIP', 40, 55)
      
      doc.fillColor('#ffffff')
        .fontSize(10)
        .font('Helvetica')
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width - 250, 42, { width: 200, align: 'right' })
        .text(`Generated: ${new Date().toLocaleDateString('en-NG')}`, 
              doc.page.width - 250, 59, { width: 200, align: 'right' })

      // ===== STAFF INFORMATION SECTION =====
      doc.y = 120 // Set Y position manually
      
      doc.roundedRect(40, doc.y, doc.page.width - 80, 140, 6)
        .fill('#f3f6fb')
      
      doc.fillColor('#000000')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('EMPLOYEE INFORMATION', 55, doc.y + 10)
        
      // Left column
      doc.fontSize(10)
        .font('Helvetica')
        .text(`Staff ID: ${staff.staffId}`, 55, doc.y + 30)
        .text(`Staff Name: ${staff.firstName} ${staff.lastName}`, 55, doc.y + 47)
        .text(`Position: ${payroll.position || staff.position || staff.designation || 'N/A'}`, 55, doc.y + 64)
        .text(`Department: ${staff.department || 'N/A'}`, 55, doc.y + 81)
        .text(`Email: ${staff.email}`, 55, doc.y + 98)
      
      // Right column
      doc.text(`Number of days in the month: ${payroll.daysInMonth || 0}`, 
              doc.page.width / 2 + 10, doc.y + 30)
        .text(`Number of days worked: ${payroll.daysWorked || 0}`, 
              doc.page.width / 2 + 10, doc.y + 47)
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width / 2 + 10, doc.y + 64)

      // Move Y position after staff section
      doc.y = doc.y + 155

      // ===== EARNINGS SECTION =====
      if (!checkPageSpace(250)) {
        doc.addPage()
        doc.y = 50
      }
      
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('EARNINGS', 40, doc.y)
      
      doc.y += 20
      
      doc.moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke('#1e3a5f')
      
      doc.y += 15

      // Column headers
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text('Description', 50, doc.y)
        .text('Amount', doc.page.width - 180, doc.y, { width: 130, align: 'right' })
      
      doc.y += 20

      // Earnings fields
      const earningsFields = [
        { displayName: 'Prorated Gross Pay', value: payroll.proratedGrossPay ?? payroll.basicSalary ?? 0 },
        { displayName: 'Overtime Income (OI)', value: payroll.overtimeIncome ?? 0 },
        { displayName: 'Communication Allowance (CA)', value: payroll.communicationAllowance ?? 0 },
        { displayName: 'Transportation Allowance (TA)', value: payroll.transportationAllowance ?? payroll.transportAllowance ?? 0 },
        { displayName: 'Outstanding Income (OI)', value: payroll.outstandingIncome ?? 0 },
        { displayName: 'Performance Bonus (PB)', value: payroll.bonusKPI ?? 0 },
        { displayName: 'Housing Allowance', value: payroll.housingAllowance ?? 0 },
        { displayName: 'Other Allowances', value: payroll.otherAllowances ?? 0 },
        { displayName: 'Dressing Allowance', value: payroll.dressingAllowance ?? 0 },
        { displayName: 'Leave Allowance', value: payroll.leaveAllowance ?? 0 },
        { displayName: 'Entertainment Allowance', value: payroll.entertainmentAllowance ?? 0 },
        { displayName: 'Utility Allowance', value: payroll.utilityAllowance ?? 0 },
      ];

      earningsFields.forEach(field => {
        if (!checkPageSpace(18)) {
          doc.addPage()
          doc.y = 50
        }
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(field.displayName, 50, doc.y)
          .text(formatCurrency(field.value), doc.page.width - 180, doc.y, {
            width: 130,
            align: 'right'
          })
        doc.y += 18
      });

      // Gross Pay
      if (!checkPageSpace(25)) {
        doc.addPage()
        doc.y = 50
      }
      doc.y += 5
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#0f5132')
        .text('Gross Salary', 50, doc.y)
        .text(formatCurrency(payroll.grossPay ?? 0), doc.page.width - 180, doc.y, {
          width: 130,
          align: 'right'
        })

      // ===== DEDUCTIONS SECTION =====
      doc.y += 35
      
      if (!checkPageSpace(150)) {
        doc.addPage()
        doc.y = 50
      }
      
      doc.fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#8b0000')
        .text('DEDUCTIONS', 40, doc.y)
      
      doc.y += 20
      
      doc.moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke('#8b0000')
      
      doc.y += 15

      // Column headers
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#333333')
        .text('Description', 50, doc.y)
        .text('Amount', doc.page.width - 180, doc.y, { width: 130, align: 'right' })
      
      doc.y += 20

      // Deduction fields
      const deductionFields = [
        { displayName: 'Employee Pension Deduction', value: payroll.pension ?? 0 },
        { displayName: 'Payee', value: payroll.payee ?? 0 },
        { displayName: 'Other Deductions', value: payroll.deductions ?? 0 },
      ];

      let totalDeductions = 0
      
      deductionFields.forEach(field => {
        if (!checkPageSpace(18)) {
          doc.addPage()
          doc.y = 50
        }
        totalDeductions += field.value
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(field.displayName, 50, doc.y)
          .text(formatCurrency(field.value), doc.page.width - 180, doc.y, {
            width: 130,
            align: 'right'
          })
        doc.y += 18
      });

      // Total Deductions
      if (!checkPageSpace(25)) {
        doc.addPage()
        doc.y = 50
      }
      doc.y += 5
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#8b0000')
        .text('TOTAL DEDUCTIONS', 50, doc.y)
        .text(formatCurrency(totalDeductions), doc.page.width - 180, doc.y, {
          width: 130,
          align: 'right'
        })

      // ===== NET SALARY SECTION =====
      doc.y += 45
      
      if (!checkPageSpace(80)) {
        doc.addPage()
        doc.y = 50
      }
      
      doc.roundedRect(40, doc.y, doc.page.width - 80, 60, 6)
        .fill('#e8f0ff')
      
      doc.fillColor('#0b1f44')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Net Salary', 55, doc.y + 20)
      
      doc.fontSize(18)
        .text(formatCurrency(payroll.netPay ?? 0), doc.page.width - 220, doc.y + 15, {
          width: 170,
          align: 'right'
        })

      // ===== PAYMENT DETAILS SECTION =====
      doc.y += 75
      
      if (!checkPageSpace(100)) {
        doc.addPage()
        doc.y = 50
      }
      
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('PAYMENT DETAILS', 40, doc.y)
      
      doc.y += 20
      
      doc.moveTo(40, doc.y)
        .lineTo(doc.page.width - 40, doc.y)
        .stroke('#1e3a5f')
      
      doc.y += 15

      // Payment fields
      const paymentFields = [
        { displayName: 'WALLET PAYMENT', value: payroll.walletPayment ?? 0 },
        { displayName: 'COMMERCIAL PAYMENT', value: payroll.commercialPayment ?? 0 },
      ];

      paymentFields.forEach(field => {
        if (!checkPageSpace(18)) {
          doc.addPage()
          doc.y = 50
        }
        doc.fontSize(10)
          .font('Helvetica')
          .fillColor('#000000')
          .text(field.displayName, 50, doc.y)
          .text(formatCurrency(field.value), doc.page.width - 180, doc.y, {
            width: 130,
            align: 'right'
          })
        doc.y += 18
      });

      // ===== ATTENDANCE SUMMARY =====
      doc.y += 15
      
      if (!checkPageSpace(30)) {
        doc.addPage()
        doc.y = 50
      }
      
      doc.fontSize(9)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`Attendance Summary: ${payroll.daysWorked || 0} days worked out of ${payroll.daysInMonth || 0} days`, 
              40, doc.y, { width: doc.page.width - 80, align: 'center' })

      // ===== FOOTER SECTION =====
      // Move to bottom of page for footer
      const footerY = doc.page.height - 80
      
      // Only add footer if we're not already past it
      if (doc.y < footerY - 20) {
        doc.y = footerY
      } else {
        doc.addPage()
        doc.y = doc.page.height - 80
      }
      
      // Company contact info
      doc.fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text(
          `${companyInfo?.name || staff.companyName} | ${companyInfo?.address || staff.companyAddress || ''} | Tel: ${companyInfo?.phone || staff.companyPhone || ''}`,
          40,
          doc.y,
          { align: 'center', width: doc.page.width - 80 }
        )

      // Disclaimer
      doc.fontSize(7)
        .fillColor('#999999')
        .text(
          'This is a computer-generated document. No signature is required.',
          40,
          doc.y + 15,
          { align: 'center', width: doc.page.width - 80 }
        )

      // Page info
      doc.fontSize(7)
        .fillColor('#999999')
        .text(
          `Generated on ${new Date().toLocaleString('en-NG')} | Page 1 of 1`,
          40,
          doc.y + 30,
          { align: 'center', width: doc.page.width - 80 }
        )

      // Finalize the PDF
      doc.end()
      
      console.log(`✅ Enhanced payslip PDF generated for ${staff.staffId}: ${fileName}`)
      
    } catch (error) {
      console.error('❌ Error generating enhanced payslip PDF:', error)
      reject(error)
    }
  })
}