// ============================================================
// PHED Module – PDF Payslip Generator (PDFKit)
// Explicit x/y coordinates on every text call – no continued:true.
// Shows ALL earnings and deductions rows (including zeros) to
// exactly match the UI individual report view.
// ============================================================

import PDFDocument from 'pdfkit'

// ── Palette ───────────────────────────────────────────────────
const C_DARK    = '#1a3a5c'
const C_MID     = '#2d5080'
const C_LIGHT   = '#dce9f7'
const C_ROW_ALT = '#f4f7fb'
const C_TOTAL   = '#dce9f7'
const C_GREY    = '#6b7280'
const C_BLACK   = '#1f2937'
const C_WHITE   = '#ffffff'

// ── Layout constants ──────────────────────────────────────────
const ML       = 40
const MR       = 40
const MT       = 36
const GAP      = 10
const COL_GAP  = 10
const HDR_H    = 20
const ROW_H    = 15
const INFO_ROW = 19

export interface PayslipData {
  companyName:  string
  staffName:    string
  staffIdCode:  string
  gradeName:    string
  department:   string
  unit:         string
  regionName:   string
  category:     string
  periodName:   string

  basicSalary:           number
  housingAllowance:      number
  transportAllowance:    number
  furnitureAllowance:    number
  mealSubsidy:           number
  utilityAllowance:      number
  leaveAllowance:        number
  domesticAllowance:     number
  hazardAllowance:       number
  electricityAllowance:  number
  discoveryAllowance:    number
  carSubsidy:            number
  entertainmentAllowance: number
  dataAllowance:         number
  nightAllowance:        number
  arrears:               number
  otherAllowances:       number
  overtimeEarnings:      number
  grossSalary:           number

  pensionEmployee:        number
  pensionEmployer:        number
  nhf:                    number
  monthlyPAYE:            number
  unions:                 { name: string; amount: number }[]
  cooperatives:           { name: string; amount: number }[]
  deductionLiabilities:   number
  otherDeductions:        number
  totalDeductions:        number
  netSalary:              number

  annualGrossIncome:      number
  annualRentRelief:       number
  lifeAssuranceAmount:    number
  annualPensionDeduction: number
  annualChargeableIncome: number
  annualPAYE:             number

  bankName:       string
  accountNumber:  string
  accountName:    string
  pfaName:        string
  rsaPin:         string
  pensionNumber?: string
  tin?:           string
}

// ── Main generator ────────────────────────────────────────────
export function generatePayslipPdf(data: PayslipData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', margin: 0 })
    const chunks: Buffer[] = []
    doc.on('data',  c => chunks.push(c))
    doc.on('end',   () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const PW      = doc.page.width
    const usableW = PW - ML - MR
    const colW    = (usableW - COL_GAP) / 2
    const col1X   = ML
    const col2X   = ML + colW + COL_GAP

    let y = MT

    // ──────────────────────────────────────────────────────────
    // 1. HEADER
    // ──────────────────────────────────────────────────────────
    const HEADER_H = 70
    doc.rect(col1X, y, usableW, HEADER_H).fill(C_DARK)

    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(14)
       .text(data.companyName || '24/7HR', col1X + 14, y + 14,
             { width: colW - 14, lineBreak: false })
    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text('24/7HR Platform', col1X + 14, y + 36,
             { width: colW - 14, lineBreak: false })

    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text('EMPLOYEE PAYSLIP', col2X, y + 14,
             { width: colW - 14, align: 'right', lineBreak: false })
    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(13)
       .text(`Period: ${data.periodName}`, col2X, y + 30,
             { width: colW - 14, align: 'right', lineBreak: false })

    doc.rect(col1X, y + HEADER_H - 3, usableW, 3).fill(C_MID)
    y += HEADER_H + GAP

    // ──────────────────────────────────────────────────────────
    // 2. EMPLOYEE INFO BOX
    // ──────────────────────────────────────────────────────────
    const infoRows: [string, string, string, string][] = [
      ['Name',      data.staffName    || '—', 'Department', data.department  || '—'],
      ['Staff ID',  data.staffIdCode  || '—', 'Unit',       data.unit        || '—'],
      ['Grade',     data.gradeName    || '—', 'Region',     data.regionName  || '—'],
      ['Category',  data.category     || '—', 'Pay Period', data.periodName],
    ]
    const INFO_H = 6 + infoRows.length * INFO_ROW + 8

    doc.rect(col1X, y, usableW, INFO_H).fill(C_LIGHT)
    doc.rect(col1X, y + INFO_H - 2, usableW, 2).fill(C_MID)

    const LBL_W = 58

    infoRows.forEach(([lbl1, val1, lbl2, val2], i) => {
      const ry = y + 6 + i * INFO_ROW
      const ty = ry + 3

      doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
         .text(lbl1 + ':', col1X + 10, ty, { width: LBL_W, lineBreak: false })
      doc.fillColor(C_BLACK).font('Helvetica-Bold').fontSize(8)
         .text(val1, col1X + 10 + LBL_W, ty,
               { width: colW - LBL_W - 14, lineBreak: false })

      doc.strokeColor('#b0c8e0').lineWidth(0.5)
         .moveTo(col2X - 5, ry + 2).lineTo(col2X - 5, ry + INFO_ROW - 2).stroke()

      doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
         .text(lbl2 + ':', col2X, ty, { width: LBL_W, lineBreak: false })
      doc.fillColor(C_BLACK).font('Helvetica-Bold').fontSize(8)
         .text(val2, col2X + LBL_W, ty,
               { width: colW - LBL_W - 14, lineBreak: false })
    })

    y += INFO_H + GAP

    // ──────────────────────────────────────────────────────────
    // 3. EARNINGS (left col) | DEDUCTIONS (right col)
    //    Every row always shown including zeros — matches UI.
    //    isTotal=true → bold label + highlighted background.
    // ──────────────────────────────────────────────────────────
    const earningRows: [string, number, boolean][] = [
      ['Basic Salary',            data.basicSalary,            false],
      ['Housing Allowance',       data.housingAllowance,       false],
      ['Transport Allowance',     data.transportAllowance,     false],
      ['Furniture Allowance',     data.furnitureAllowance,     false],
      ['Meal Subsidy',            data.mealSubsidy,            false],
      ['Utility Allowance',       data.utilityAllowance,       false],
      ['Leave Allowance',         data.leaveAllowance,         false],
      ['Domestic Allowance',      data.domesticAllowance,      false],
      ['Hazard Allowance',        data.hazardAllowance,        false],
      ['Electricity Allowance',   data.electricityAllowance,   false],
      ['Discovery Allowance',     data.discoveryAllowance,     false],
      ['Car Subsidy',             data.carSubsidy,             false],
      ['Entertainment Allowance', data.entertainmentAllowance, false],
      ['Data Allowance',          data.dataAllowance,          false],
      ['Night Allowance',         data.nightAllowance,         false],
      ['Arrears',                 data.arrears,                false],
      ['Other Allowances',        data.otherAllowances,        false],
      ['Overtime Earnings',       data.overtimeEarnings,       false],
      ['Gross Salary',            data.grossSalary,            true],
    ]

    const deductRows: [string, number, boolean][] = [
      ['Pension (Employee 8%)',  data.pensionEmployee, false],
      ['Pension (Employer 10%)', data.pensionEmployer, false],
      ['NHF (2.5% of basic)',    data.nhf,             false],
      ['Monthly PAYE',           data.monthlyPAYE,     false],
      ...data.unions.map(u => [u.name, u.amount, false] as [string, number, boolean]),
      ...data.cooperatives.map(c => [c.name, c.amount, false] as [string, number, boolean]),
      ['Deduction Liabilities',  data.deductionLiabilities, false],
      ['Other Deductions',       data.otherDeductions,      false],
      ['Total Deductions',       data.totalDeductions,      true],
    ]

    drawMoneyTable(doc, 'EARNINGS',   earningRows, col1X, y, colW, C_DARK)
    drawMoneyTable(doc, 'DEDUCTIONS', deductRows,  col2X, y, colW, C_MID)

    const tableH = HDR_H + Math.max(earningRows.length, deductRows.length) * ROW_H
    y += tableH + GAP

    // ──────────────────────────────────────────────────────────
    // 4. NET SALARY BAR
    // ──────────────────────────────────────────────────────────
    const BAR_H = 34
    doc.rect(col1X, y, usableW, BAR_H).fill(C_DARK)

    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text('NET SALARY', col1X + 14, y + 7, { lineBreak: false })
    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(15)
       .text(fmt(data.netSalary), col1X + 14, y + 17,
             { width: usableW - 28, align: 'right', lineBreak: false })

    y += BAR_H + GAP

    // ──────────────────────────────────────────────────────────
    // 5. BANKING & PENSION — two-column key-value grid
    // ──────────────────────────────────────────────────────────
    const bankingRows: [string, string, string, string][] = [
      ['Bank Name',      data.bankName      || '—', 'PFA Name', data.pfaName || '—'],
      ['Account Number', data.accountNumber || '—', 'RSA PIN',  data.rsaPin  || '—'],
      ['Account Name',   data.accountName   || '—', '',         ''],
    ]
    if (data.pensionNumber || data.tin) {
      bankingRows.push([
        'Pension Number', data.pensionNumber || '—',
        'TIN',            data.tin           || '—',
      ])
    }

    const BANK_ROW_H = 18
    const BANK_H     = HDR_H + bankingRows.length * BANK_ROW_H

    doc.rect(col1X, y, usableW, BANK_H).fill(C_LIGHT)
    doc.rect(col1X, y, usableW, HDR_H).fill(C_MID)
    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(8)
       .text('BANKING & PENSION', col1X + 8, y + 6,
             { width: usableW - 16, lineBreak: false })

    const BLBL_W = 80

    bankingRows.forEach(([lbl1, val1, lbl2, val2], i) => {
      const ry = y + HDR_H + i * BANK_ROW_H
      const bg = i % 2 === 0 ? C_WHITE : C_ROW_ALT
      doc.rect(col1X, ry, usableW, BANK_ROW_H).fill(bg)
      const ty = ry + 5

      doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
         .text(lbl1 + (lbl1 ? ':' : ''), col1X + 10, ty,
               { width: BLBL_W, lineBreak: false })
      doc.fillColor(C_BLACK).font('Helvetica-Bold').fontSize(8)
         .text(val1, col1X + 10 + BLBL_W, ty,
               { width: colW - BLBL_W - 10, lineBreak: false })

      if (lbl2) {
        doc.strokeColor('#b0c8e0').lineWidth(0.5)
           .moveTo(col2X - 5, ry + 3).lineTo(col2X - 5, ry + BANK_ROW_H - 3).stroke()
        doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
           .text(lbl2 + ':', col2X, ty, { width: BLBL_W, lineBreak: false })
        doc.fillColor(C_BLACK).font('Helvetica-Bold').fontSize(8)
           .text(val2, col2X + BLBL_W, ty,
                 { width: colW - BLBL_W - 10, lineBreak: false })
      }
    })

    y += BANK_H + GAP

    // ──────────────────────────────────────────────────────────
    // 6. TAX COMPUTATION
    // ──────────────────────────────────────────────────────────
    const taxRows: [string, number, boolean][] = [
      ['Annual Gross Income',      data.annualGrossIncome,      false],
      ['Annual Rent Relief',       data.annualRentRelief,       false],
      ['Annual Pension Deduction', data.annualPensionDeduction, false],
      ...(data.lifeAssuranceAmount > 0
        ? [['Life Assurance', data.lifeAssuranceAmount, false] as [string, number, boolean]]
        : []),
      ['Annual Chargeable Income', data.annualChargeableIncome, false],
      ['Annual PAYE',              data.annualPAYE,             false],
      ['Monthly PAYE',             data.monthlyPAYE,            true],
    ]
    drawMoneyTable(doc, 'TAX COMPUTATION', taxRows, col1X, y, usableW, '#374151')
    y += HDR_H + taxRows.length * ROW_H + GAP

    // ──────────────────────────────────────────────────────────
    // 7. FOOTER
    // ──────────────────────────────────────────────────────────
    doc.strokeColor('#d1d5db').lineWidth(0.5)
       .moveTo(col1X, y).lineTo(col1X + usableW, y).stroke()
    doc.fillColor(C_GREY).font('Helvetica').fontSize(7)
       .text(
         'This payslip is computer-generated and does not require a signature.',
         col1X, y + 6, { width: usableW, align: 'center', lineBreak: false }
       )
    doc.text(
      `Generated by 24/7HR Platform for ${data.companyName}. Confidential — authorised personnel only.`,
      col1X, y + 16, { width: usableW, align: 'center', lineBreak: false }
    )

    doc.end()
  })
}

// ── Helpers ───────────────────────────────────────────────────

function drawMoneyTable(
  doc:     PDFKit.PDFDocument,
  title:   string,
  rows:    [string, number, boolean][],
  x:       number,
  y:       number,
  width:   number,
  hdrFill: string,
): void {
  doc.rect(x, y, width, HDR_H).fill(hdrFill)
  doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(8)
     .text(title, x + 8, y + 6, { width: width - 16, lineBreak: false })

  const LABEL_RATIO = 0.62
  const labelW      = width * LABEL_RATIO
  const valueW      = width - labelW - 16

  rows.forEach(([label, value, isTotal], i) => {
    const ry = y + HDR_H + i * ROW_H
    const bg = isTotal ? C_TOTAL : (i % 2 === 0 ? C_WHITE : C_ROW_ALT)
    doc.rect(x, ry, width, ROW_H).fill(bg)

    const ty   = ry + 4
    const font = isTotal ? 'Helvetica-Bold' : 'Helvetica'
    const clr  = isTotal ? C_MID : C_BLACK

    doc.fillColor(clr).font(font).fontSize(8)
       .text(label, x + 8, ty, { width: labelW - 8, lineBreak: false })
    doc.font('Helvetica-Bold')
       .text(fmt(value), x + labelW, ty,
             { width: valueW, align: 'right', lineBreak: false })
  })
}

function fmt(v: number): string {
  return '₦' + (v || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
