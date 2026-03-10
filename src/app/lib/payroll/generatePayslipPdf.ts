// src/app/lib/payroll/generatePayslipPdf.ts
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import type { GeneratePayslipInput, TemplateType } from './types'

const fontkit = require('fontkit') as {
  openSync: (filePath: string) => { hasGlyphForCodePoint: (codePoint: number) => boolean }
}

function formatCurrency(n: number) {
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

interface PayslipData {
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
  bonusKPI?: number
  deductions?: number
}

function preparePayslipData(payroll: any, templateType: TemplateType = 'ISURF_STANDARD'): PayslipData {
  if (templateType === 'BLUERIDGE') {
    return {
      basicSalary: payroll.basicSalary || 0,
      housingAllowance: payroll.housingAllowance || 0,
      transportAllowance: payroll.transportAllowance || 0,
      transportationAllowance: 0,
      otherAllowances: payroll.otherAllowances || 0,
      grossPay: payroll.grossPay || 0,
      payee: payroll.payee || 0,
      pension: payroll.pension || 0,
      netPay: payroll.netPay || 0,
      daysInMonth: payroll.daysInMonth || 0,
      daysWorked: payroll.daysWorked || 0,
      bonusKPI: payroll.bonusKPI || 0,
      deductions: payroll.deductions || 0
    }
  }
  
  return {
    basicSalary: payroll.basicSalary || 0,
    housingAllowance: payroll.housingAllowance || 0,
    transportAllowance: payroll.transportAllowance || 0,
    transportationAllowance: payroll.transportationAllowance || 0,
    otherAllowances: payroll.otherAllowances || 0,
    grossPay: payroll.grossPay || 0,
    payee: payroll.payee || 0,
    pension: payroll.pension || 0,
    netPay: payroll.netPay || 0,
    daysInMonth: payroll.daysInMonth || 0,
    daysWorked: payroll.daysWorked || 0,
    bonusKPI: payroll.bonusKPI || 0,
    deductions: payroll.deductions || 0
  }
}

export async function generatePayslipPdf(
  input: GeneratePayslipInput
): Promise<{ pdfBuffer: Uint8Array; fileName: string }> {
  const { staff, payroll, templateType = 'ISURF_STANDARD' } = input

  const payslipData = preparePayslipData(payroll, templateType)

  const safeMonth = payroll.periodMonth.toString().padStart(2, '0')
  const fileName = `payslip-${staff.staffId}-${safeMonth}-${payroll.periodYear}.pdf`

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' })

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
          fileName: fileName
        })
      })
      
      doc.on('error', reject)

      doc.rect(0, 0, doc.page.width, 80).fill('#1e3a5f')
      
      doc.fillColor('#ffffff')
        .fontSize(18)
        .font(boldFont)
        .text(staff.companyName || 'COMPANY NAME LTD', 40, 25)
      
      doc.fontSize(11)
        .font(regularFont)
        .text('SALARY PAYSLIP', 40, 50)
      
      doc.fillColor('#ffffff')
        .fontSize(9)
        .text(`Template: ${templateType === 'BLUERIDGE' ? 'Blueridge' : 'Isurf Standard'}`, 
              doc.page.width - 220, 25)
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width - 220, 40)
        .text(`Generated: ${new Date().toLocaleDateString('en-NG')}`, 
              doc.page.width - 220, 55)

      const staffSectionTop = 100
      doc.roundedRect(40, staffSectionTop, doc.page.width - 80, 90, 6)
        .fill('#f3f6fb')
      
      doc.fillColor('#000000')
        .fontSize(11)
        .font(boldFont)
        .text('STAFF INFORMATION', 55, staffSectionTop + 5)
        .font(regularFont)
        .text(`Name: ${staff.firstName} ${staff.lastName}`, 55, staffSectionTop + 25)
        .text(`Staff ID: ${staff.staffId}`, 55, staffSectionTop + 42)
        .text(`Email: ${staff.email}`, 55, staffSectionTop + 59)
      
      doc.text(`Department: ${staff.department || 'N/A'}`, 
              doc.page.width / 2 + 10, staffSectionTop + 25)
        .text(`Designation: ${staff.designation || staff.position || 'N/A'}`, 
              doc.page.width / 2 + 10, staffSectionTop + 42)
        .text(`Company: ${staff.companyName || 'N/A'}`, 
              doc.page.width / 2 + 10, staffSectionTop + 59)

      let currentY = staffSectionTop + 115
      
      doc.fontSize(12)
        .font(boldFont)
        .fillColor('#1e3a5f')
        .text('EARNINGS', 40, currentY)
      
      currentY += 15
      
      doc.moveTo(40, currentY)
        .lineTo(doc.page.width - 40, currentY)
        .stroke('#1e3a5f')
      
      currentY += 10

      const earnings = [
        { label: 'Basic Salary', value: payslipData.basicSalary },
        { label: 'Housing Allowance', value: payslipData.housingAllowance },
        { label: 'Transport Allowance', value: payslipData.transportAllowance },
      ]

      if (templateType === 'ISURF_STANDARD' && payslipData.transportationAllowance > 0) {
        earnings.push({ 
          label: 'Transportation/Dressing Allowance', 
          value: payslipData.transportationAllowance 
        })
      }

      if (payslipData.otherAllowances > 0) {
        earnings.push({ 
          label: templateType === 'BLUERIDGE' ? 'Other Allowances' : 'Other Allowances (Leave, Entertainment, Utility)', 
          value: payslipData.otherAllowances 
        })
      }

      if (payslipData.bonusKPI && payslipData.bonusKPI > 0) {
        earnings.push({ 
          label: 'Performance Bonus (KPI)', 
          value: payslipData.bonusKPI 
        })
      }

      doc.fontSize(10)
        .fillColor('#000000')
        .font(regularFont)

      earnings.forEach(item => {
        if (item.value > 0) {
          doc.text(item.label, 50, currentY)
          drawCurrency(doc, item.value, doc.page.width - 180, currentY, {
            width: 130,
            align: 'right',
            font: regularFont,
            fontSize: 10,
            color: '#000000',
            useTextNairaSymbol,
          })
          currentY += 18
        }
      })

      currentY += 5
      doc.fontSize(11)
        .font(boldFont)
        .fillColor('#0f5132')
        .text('Total Gross Pay', 50, currentY)
      drawCurrency(doc, payslipData.grossPay, doc.page.width - 180, currentY, {
        width: 130,
        align: 'right',
        font: boldFont,
        fontSize: 11,
        color: '#0f5132',
        useTextNairaSymbol,
      })

      currentY += 35
      
      doc.fontSize(12)
        .font(boldFont)
        .fillColor('#8b0000')
        .text('DEDUCTIONS', 40, currentY)
      
      currentY += 15
      
      doc.moveTo(40, currentY)
        .lineTo(doc.page.width - 40, currentY)
        .stroke('#8b0000')
      
      currentY += 10

      const deductions = [
        { label: 'PAYE (Tax)', value: payslipData.payee },
        { label: 'Pension Contribution', value: payslipData.pension },
      ]

      if (templateType === 'BLUERIDGE' && payslipData.deductions && payslipData.deductions > 0) {
        deductions.push({ 
          label: 'Penalty & Other Deductions', 
          value: payslipData.deductions 
        })
      }

      doc.fontSize(10)
        .fillColor('#000000')
        .font(regularFont)

      deductions.forEach(item => {
        if (item.value > 0) {
          doc.text(item.label, 50, currentY)
          drawCurrency(doc, item.value, doc.page.width - 180, currentY, {
            width: 130,
            align: 'right',
            font: regularFont,
            fontSize: 10,
            color: '#000000',
            useTextNairaSymbol,
          })
          currentY += 18
        }
      })

      const totalDeductions = payslipData.payee + payslipData.pension + (payslipData.deductions || 0)
      currentY += 5
      doc.fontSize(11)
        .font(boldFont)
        .fillColor('#8b0000')
        .text('Total Deductions', 50, currentY)
      drawCurrency(doc, totalDeductions, doc.page.width - 180, currentY, {
        width: 130,
        align: 'right',
        font: boldFont,
        fontSize: 11,
        color: '#8b0000',
        useTextNairaSymbol,
      })

      currentY += 45
      
      doc.roundedRect(40, currentY, doc.page.width - 80, 45, 6)
        .fill('#e8f0ff')
      
      doc.fillColor('#0b1f44')
        .fontSize(14)
        .font(boldFont)
        .text('NET SALARY PAYABLE', 55, currentY + 13)
      
      drawCurrency(doc, payslipData.netPay, doc.page.width - 200, currentY + 13, {
        width: 150,
        align: 'right',
        font: boldFont,
        fontSize: 14,
        color: '#0b1f44',
        useTextNairaSymbol,
      })

      currentY += 70
      
      doc.fillColor('#000000')
        .fontSize(10)
        .font(regularFont)
        .text(`Working Days in Month: ${payslipData.daysInMonth}`, 50, currentY)
        .text(`Days Worked: ${payslipData.daysWorked}`, doc.page.width / 2 + 10, currentY)

      if (payslipData.daysInMonth > 0) {
        const attendanceRate = (payslipData.daysWorked / payslipData.daysInMonth * 100).toFixed(1)
        doc.text(`Attendance Rate: ${attendanceRate}%`, doc.page.width - 180, currentY)
      }

      const footerY = doc.page.height - 40
      
      doc.fontSize(8)
        .fillColor('#666666')
        .font(regularFont)
        .text(
          'This is a system-generated payslip. For any discrepancies, please contact HR department.',
          30,
          footerY,
          { align: 'center', width: doc.page.width - 85 }
        )

      doc.fontSize(8)
        .fillColor('#999999')
        .text(
          `Page 1 of 1 • Template: ${templateType}`,
          30,
          doc.page.height - 20,
          { align: 'center', width: doc.page.width - 85 }
        )

      doc.end()
      
      console.log(`✅ Payslip PDF generated for ${staff.staffId}: ${fileName} (${templateType})`)
      
    } catch (error) {
      console.error('❌ Error generating payslip PDF:', error)
      reject(error)
    }
  })
}