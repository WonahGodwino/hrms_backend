// src/app/lib/payroll/generateEnhancedPayslipPdf.ts
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

const fontkit = require('fontkit') as {
  openSync: (filePath: string) => { hasGlyphForCodePoint: (codePoint: number) => boolean }
}

function formatCurrency(n: number): string {
  const safe = Number.isFinite(n) ? n : 0
  return safe.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function drawNairaSymbol(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  const symbolHeight = Math.max(size, 8)
  const symbolWidth = symbolHeight * 0.72
  const lineWidth = Math.max(0.8, symbolHeight * 0.08)
  const barInset = lineWidth
  const bar1Y = y + symbolHeight * 0.38
  const bar2Y = y + symbolHeight * 0.62

  doc.save()
  doc.strokeColor(color)
  doc.lineWidth(lineWidth)

  doc.moveTo(x, y)
    .lineTo(x, y + symbolHeight)
    .moveTo(x, y + symbolHeight)
    .lineTo(x + symbolWidth, y)
    .moveTo(x + symbolWidth, y)
    .lineTo(x + symbolWidth, y + symbolHeight)
    .moveTo(x - barInset, bar1Y)
    .lineTo(x + symbolWidth + barInset, bar1Y)
    .moveTo(x - barInset, bar2Y)
    .lineTo(x + symbolWidth + barInset, bar2Y)
    .stroke()

  doc.restore()
}

function drawCurrency(
  doc: PDFKit.PDFDocument,
  amount: number,
  x: number,
  y: number,
  options: {
    width?: number
    align?: 'left' | 'right'
    font: string
    fontSize: number
    color: string
    useTextNairaSymbol?: boolean
  }
) {
  const formatted = formatCurrency(amount)
  const textWithNaira = `₦ ${formatted}`

  if (options.useTextNairaSymbol) {
    doc.font(options.font).fontSize(options.fontSize).fillColor(options.color)
    if (options.align === 'right' && options.width) {
      doc.text(textWithNaira, x, y, {
        width: options.width,
        align: 'right',
        lineBreak: false,
      })
      return
    }

    doc.text(textWithNaira, x, y, {
      lineBreak: false,
    })
    return
  }

  const symbolSize = Math.max(options.fontSize * 0.9, 8)
  const symbolGap = Math.max(options.fontSize * 0.35, 3)
  const symbolWidth = symbolSize * 0.72 + symbolGap

  doc.font(options.font).fontSize(options.fontSize).fillColor(options.color)

  if (options.align === 'right' && options.width) {
    const textWidth = doc.widthOfString(formatted)
    const startX = x + options.width - (symbolWidth + textWidth)
    drawNairaSymbol(doc, startX, y + Math.max(options.fontSize * 0.08, 0.5), symbolSize, options.color)
    doc.text(formatted, startX + symbolWidth, y, {
      lineBreak: false,
    })
    return
  }

  drawNairaSymbol(doc, x, y + Math.max(options.fontSize * 0.08, 0.5), symbolSize, options.color)
  doc.text(formatted, x + symbolWidth, y, {
    lineBreak: false,
  })
}

function fontHasNairaGlyph(fontPath: string): boolean {
  try {
    const font = fontkit.openSync(fontPath)
    return !!font.hasGlyphForCodePoint(0x20A6)
  } catch {
    return false
  }
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
  
  console.log('PDF Generator - Generating payslip for:', {
    staffId: staff.staffId,
    daysInMonth: payroll.daysInMonth,
    daysWorked: payroll.daysWorked
  })
  
  const fileName = `payslip-${staff.staffId}-${payroll.periodMonth.toString().padStart(2, '0')}-${payroll.periodYear}.pdf`

  return new Promise((resolve, reject) => {
    try {
      // Create document with standard margins
      const doc = new PDFDocument({ 
        margin: 40, 
        size: 'A4'
      })

      let regularFont = 'Helvetica'
      let boldFont = 'Helvetica-Bold'
      let useTextNairaSymbol = false

      const regularCandidates = [
        path.join(process.cwd(), 'public', 'payslips', 'fonts', 'LiberationSans-Regular.ttf'),
        path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Regular.ttf'),
      ]
      const boldCandidates = [
        path.join(process.cwd(), 'public', 'payslips', 'fonts', 'LiberationSans-Bold.ttf'),
        path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Bold.ttf'),
      ]

      const regularFontPath = regularCandidates.find((fontPath) => fs.existsSync(fontPath))
      const boldFontPath = boldCandidates.find((fontPath) => fs.existsSync(fontPath))

      if (regularFontPath && boldFontPath) {
        doc.registerFont('PayslipRegular', regularFontPath)
        doc.registerFont('PayslipBold', boldFontPath)
        regularFont = 'PayslipRegular'
        boldFont = 'PayslipBold'
        useTextNairaSymbol = fontHasNairaGlyph(regularFontPath) && fontHasNairaGlyph(boldFontPath)
      }
      
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
      
      // Company Name
      doc.fillColor('#ffffff')
        .fontSize(20)
        .font(boldFont)
        .text(companyInfo?.name || staff.companyName || 'COMPANY NAME LTD', 40, 25)
      
      doc.fontSize(14)
        .font(regularFont)
        .text('PAYSLIP', 40, 55)
      
      // Right side info
      doc.fillColor('#ffffff')
        .fontSize(10)
        .font(regularFont)
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width - 250, 42, { width: 200, align: 'right' })
        .text(`Generated: ${new Date().toLocaleDateString('en-NG')}`, 
              doc.page.width - 250, 59, { width: 200, align: 'right' })

      // ===== STAFF INFORMATION SECTION =====
      let y = 120
      
      doc.roundedRect(40, y, doc.page.width - 80, 140, 6)
        .fill('#f3f6fb')
      
      doc.fillColor('#000000')
        .fontSize(12)
        .font(boldFont)
        .text('EMPLOYEE INFORMATION', 55, y + 10)
        
      // Left column - Staff details
      doc.fontSize(10)
        .font(regularFont)
        .text(`Staff ID: ${staff.staffId}`, 55, y + 30)
        .text(`Staff Name: ${staff.firstName} ${staff.lastName}`, 55, y + 47)
        .text(`Position: ${payroll.position || staff.position || staff.designation || 'N/A'}`, 55, y + 64)
        .text(`Department: ${staff.department || 'N/A'}`, 55, y + 81)
        .text(`Email: ${staff.email}`, 55, y + 98)
      
      // Right column - Attendance Info
      const rightColX = doc.page.width / 2 + 20
      doc.text(`Number of days in the month: ${payroll.daysInMonth || 0}`, rightColX, y + 30)
        .text(`Number of days worked: ${payroll.daysWorked || 0}`, rightColX, y + 47)
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, rightColX, y + 64)

      y = y + 155

      // ===== EARNINGS SECTION =====
      doc.fontSize(14)
        .font(boldFont)
        .fillColor('#1e3a5f')
        .text('EARNINGS', 40, y)
      
      y += 20
      
      doc.moveTo(40, y)
        .lineTo(doc.page.width - 40, y)
        .stroke('#1e3a5f')
      
      y += 15

      // Column headers
      doc.fontSize(10)
        .font(boldFont)
        .fillColor('#333333')
        .text('Description', 50, y)
        .text('Amount', doc.page.width - 180, y, { width: 130, align: 'right' })
      
      y += 20

      // ALL EARNINGS FIELDS - SHOW ALL EVEN IF ZERO
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

      // Display ALL earnings fields (even zero values)
      earningsFields.forEach(field => {
        doc.fontSize(10)
          .font(regularFont)
          .fillColor('#000000')
          .text(field.displayName, 50, y)
        drawCurrency(doc, field.value, doc.page.width - 180, y, {
          width: 130,
          align: 'right',
          font: regularFont,
          fontSize: 10,
          color: '#000000',
          useTextNairaSymbol,
        })
        y += 18
      });

      // Gross Salary
      y += 5
      doc.fontSize(11)
        .font(boldFont)
        .fillColor('#0f5132')
        .text('Gross Salary', 50, y)
      drawCurrency(doc, payroll.grossPay ?? 0, doc.page.width - 180, y, {
        width: 130,
        align: 'right',
        font: boldFont,
        fontSize: 11,
        color: '#0f5132',
        useTextNairaSymbol,
      })

      // ===== DEDUCTIONS SECTION =====
      y += 35
      
      doc.fontSize(14)
        .font(boldFont)
        .fillColor('#8b0000')
        .text('DEDUCTIONS', 40, y)
      
      y += 20
      
      doc.moveTo(40, y)
        .lineTo(doc.page.width - 40, y)
        .stroke('#8b0000')
      
      y += 15

      // Column headers
      doc.fontSize(10)
        .font(boldFont)
        .fillColor('#333333')
        .text('Description', 50, y)
        .text('Amount', doc.page.width - 180, y, { width: 130, align: 'right' })
      
      y += 20

      // ALL DEDUCTION FIELDS - SHOW ALL EVEN IF ZERO
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
          .font(regularFont)
          .fillColor('#000000')
          .text(field.displayName, 50, y)
        drawCurrency(doc, field.value, doc.page.width - 180, y, {
          width: 130,
          align: 'right',
          font: regularFont,
          fontSize: 10,
          color: '#000000',
          useTextNairaSymbol,
        })
        y += 18
      });

      // Total Deductions
      y += 5
      doc.fontSize(11)
        .font(boldFont)
        .fillColor('#8b0000')
        .text('TOTAL DEDUCTIONS', 50, y)
      drawCurrency(doc, totalDeductions, doc.page.width - 180, y, {
        width: 130,
        align: 'right',
        font: boldFont,
        fontSize: 11,
        color: '#8b0000',
        useTextNairaSymbol,
      })

      // ===== NET SALARY & PAYMENT DETAILS =====
      y += 45
      
      // Check if we need a new page
      if (y > doc.page.height - 150) {
        doc.addPage()
        y = 50
      }
      
      // Net Salary Box
      doc.roundedRect(40, y, doc.page.width - 80, 70, 6)
        .fill('#e8f0ff')
      
      doc.fillColor('#0b1f44')
        .fontSize(16)
        .font(boldFont)
        .text('Net Salary', 55, y + 15)
      
      drawCurrency(doc, payroll.netPay ?? 0, 55, y + 35, {
        align: 'left',
        font: boldFont,
        fontSize: 18,
        color: '#0b1f44',
        useTextNairaSymbol,
      })

      // Payment Details - Below Net Salary
      y += 85
      
      doc.fontSize(12)
        .font(boldFont)
        .fillColor('#1e3a5f')
        .text('PAYMENT DETAILS', 40, y)
      
      y += 20
      
      doc.moveTo(40, y)
        .lineTo(doc.page.width - 40, y)
        .stroke('#1e3a5f')
      
      y += 15

      // Payment fields - ALL SHOWN
      const paymentFields = [
        { displayName: 'WALLET PAYMENT', value: payroll.walletPayment ?? 0 },
        { displayName: 'COMMERCIAL PAYMENT', value: payroll.commercialPayment ?? 0 },
      ];

      paymentFields.forEach(field => {
        doc.fontSize(10)
          .font(regularFont)
          .fillColor('#000000')
          .text(field.displayName, 50, y)
        drawCurrency(doc, field.value, doc.page.width - 180, y, {
          width: 130,
          align: 'right',
          font: regularFont,
          fontSize: 10,
          color: '#000000',
          useTextNairaSymbol,
        })
        y += 18
      });

      // ===== FOOTER SECTION =====
      const footerY = doc.page.height - 60
      
      // Only add footer if we're not past it
      if (y < footerY - 20) {
        y = footerY
      } else {
        doc.addPage()
        y = doc.page.height - 80
      }
      
      // Company contact info
      doc.fontSize(8)
        .fillColor('#666666')
        .font(regularFont)
        .text(
          `${companyInfo?.name || staff.companyName} | ${companyInfo?.address || staff.companyAddress || ''} | Tel: ${companyInfo?.phone || staff.companyPhone || ''}`,
          40,
          y,
          { align: 'center', width: doc.page.width - 80 }
        )

      // Disclaimer
      doc.fontSize(7)
        .fillColor('#999999')
        .text(
          'This is a computer-generated document. No signature is required.',
          40,
          y + 15,
          { align: 'center', width: doc.page.width - 80 }
        )

      // Page info
      doc.fontSize(7)
        .fillColor('#999999')
        .text(
          `Generated on ${new Date().toLocaleString('en-NG')} | Page 1 of 1`,
          40,
          y + 30,
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