// src/app/lib/payroll/generatePayslipPdf.ts
import PDFDocument from 'pdfkit'
import { mkdir } from 'fs/promises'
import fs from 'fs'
import path from 'path'
import type { GeneratePayslipInput } from './types'

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

export async function generatePayslipPdf(
  input: GeneratePayslipInput
): Promise<{ pdfBuffer: Uint8Array; fileName: string }> {
  const { staff, payroll } = input

  // Generate filename
  const safeMonth = payroll.periodMonth.toString().padStart(2, '0')
  const fileName = `payslip-${staff.staffId}-${safeMonth}-${payroll.periodYear}.pdf`

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
          fileName: fileName
        })
      })
      
      doc.on('error', reject)

      // Header
      doc.rect(0, 0, doc.page.width, 80).fill('#1e3a5f')
      
      doc.fillColor('#ffffff')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(staff.companyName || 'COMPANY NAME LTD', 40, 25)
      
      doc.fontSize(11)
        .font('Helvetica')
        .text('SALARY PAYSLIP', 40, 50)
      
      doc.fillColor('#ffffff')
        .fontSize(10)
        .text(`Pay Period: ${getMonthName(payroll.periodMonth)} ${payroll.periodYear}`, 
              doc.page.width - 220, 30)
        .text(`Generated: ${new Date().toLocaleDateString('en-NG')}`, 
              doc.page.width - 220, 45)

      // Staff Information
      const staffSectionTop = 100
      doc.roundedRect(40, staffSectionTop, doc.page.width - 80, 90, 6)
        .fill('#f3f6fb')
      
      doc.fillColor('#000000')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('STAFF INFORMATION', 55, staffSectionTop + 5)
        .font('Helvetica')
        .text(`Name: ${staff.firstName} ${staff.lastName}`, 55, staffSectionTop + 25)
        .text(`Staff ID: ${staff.staffId}`, 55, staffSectionTop + 42)
        .text(`Email: ${staff.email}`, 55, staffSectionTop + 59)
      
      doc.text(`Department: ${staff.department || 'N/A'}`, 
              doc.page.width / 2 + 10, staffSectionTop + 25)
        .text(`Designation: ${staff.designation || staff.position || 'N/A'}`, 
              doc.page.width / 2 + 10, staffSectionTop + 42)
        .text(`Company: ${staff.companyName || 'N/A'}`, 
              doc.page.width / 2 + 10, staffSectionTop + 59)

      // Earnings
      let currentY = staffSectionTop + 115
      
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1e3a5f')
        .text('EARNINGS', 40, currentY)
      
      currentY += 15
      
      doc.moveTo(40, currentY)
        .lineTo(doc.page.width - 40, currentY)
        .stroke('#1e3a5f')
      
      currentY += 10

      const earnings = [
        { label: 'Basic Salary', value: payroll.basicSalary },
        { label: 'Housing Allowance', value: payroll.housingAllowance },
        { label: 'Transport Allowance', value: payroll.transportAllowance },
        { label: 'Transportation/Dressing Allowance', value: payroll.transportationAllowance },
        { label: 'Other Allowances', value: payroll.otherAllowances },
      ]

      doc.fontSize(10)
        .fillColor('#000000')
        .font('Helvetica')

      earnings.forEach(item => {
        doc.text(item.label, 50, currentY)
        doc.text(formatCurrency(item.value), doc.page.width - 180, currentY, {
          width: 130,
          align: 'right'
        })
        currentY += 18
      })

      currentY += 5
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#0f5132')
        .text('Total Gross Pay', 50, currentY)
        .text(formatCurrency(payroll.grossPay), doc.page.width - 180, currentY, {
          width: 130,
          align: 'right'
        })

      // Deductions
      currentY += 35
      
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#8b0000')
        .text('DEDUCTIONS', 40, currentY)
      
      currentY += 15
      
      doc.moveTo(40, currentY)
        .lineTo(doc.page.width - 40, currentY)
        .stroke('#8b0000')
      
      currentY += 10

      const deductions = [
        { label: 'PAYE (Tax)', value: payroll.payee },
        { label: 'Pension Contribution', value: payroll.pension },
      ]

      doc.fontSize(10)
        .fillColor('#000000')
        .font('Helvetica')

      deductions.forEach(item => {
        doc.text(item.label, 50, currentY)
        doc.text(formatCurrency(item.value), doc.page.width - 180, currentY, {
          width: 130,
          align: 'right'
        })
        currentY += 18
      })

      const totalDeductions = payroll.payee + payroll.pension
      currentY += 5
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#8b0000')
        .text('Total Deductions', 50, currentY)
        .text(formatCurrency(totalDeductions), doc.page.width - 180, currentY, {
          width: 130,
          align: 'right'
        })

      // Net Pay
      currentY += 45
      
      doc.roundedRect(40, currentY, doc.page.width - 80, 45, 6)
        .fill('#e8f0ff')
      
      doc.fillColor('#0b1f44')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('NET SALARY PAYABLE', 55, currentY + 13)
      
      doc.text(formatCurrency(payroll.netPay), doc.page.width - 200, currentY + 13, {
        width: 150,
        align: 'right'
      })

      // Attendance
      currentY += 70
      
      doc.fillColor('#000000')
        .fontSize(10)
        .font('Helvetica')
        .text(`Working Days in Month: ${payroll.daysInMonth}`, 50, currentY)
        .text(`Days Worked: ${payroll.daysWorked}`, doc.page.width / 2 + 10, currentY)

      // Footer
      const footerY = doc.page.height - 40
      
      doc.fontSize(8)
        .fillColor('#666666')
        .font('Helvetica')
        .text(
          'This is a system-generated payslip. For any discrepancies, please contact HR department.',
          30,
          footerY,
          { align: 'center', width: doc.page.width - 80 }
        )

      doc.end()
      
      console.log(`✅ Payslip PDF generated: ${fileName}`)
      
    } catch (error) {
      reject(error)
    }
  })
}