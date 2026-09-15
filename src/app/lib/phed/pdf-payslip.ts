// ============================================================
// PHED Module – PDF Payslip Generator (PDFKit)
// Explicit x/y coordinates on every text call – no continued:true.
// Shows ALL earnings and deductions rows (including zeros) to
// exactly match the UI individual report view.
// ============================================================

import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'

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
  companyName:     string
  companyAddress?: string
  staffName:       string
  staffIdCode:     string
  gradeName:       string
  department:      string
  unit:            string
  regionName:      string
  category:        string
  role?:           string
  feeder?:         string
  nhfNumber?:      string
  franchiseState?: string
  month?:          number
  year?:           number
  periodName:      string

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
  insurance?:             number
  loan?:                  number
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
    // 1. HEADER — logo + company block, then the "Pay Advice for …" title
    // ──────────────────────────────────────────────────────────
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const monthName = (data.month != null && data.month >= 1 && data.month <= 12)
      ? MONTH_NAMES[data.month - 1]
      : data.periodName
    const pad2 = (v: number) => String(v).padStart(2, '0')
    const lastDay = (m: number, yr: number) => new Date(yr, m, 0).getDate()
    const dateRange = (data.month != null && data.year != null)
      ? `(${pad2(1)}/${pad2(data.month)}/${data.year} - ${pad2(lastDay(data.month, data.year))}/${pad2(data.month)}/${data.year})`
      : ''

    const LOGO_H   = 36
    const LOGO_W   = Math.round(LOGO_H * (115 / 56)) // ≈ 74 — preserves logo aspect ratio
    const logoPath = path.join(process.cwd(), 'public', 'logo.png')
    const hasLogo  = fs.existsSync(logoPath)
    const nameX    = col1X + (hasLogo ? LOGO_W + 14 : 0)
    const nameW    = usableW - (nameX - col1X)

    if (hasLogo) {
      doc.image(logoPath, col1X, y, { width: LOGO_W, height: LOGO_H })
    }

    doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(13)
       .text(data.companyName || '24/7HR', nameX, y + 2, { width: nameW, lineBreak: false })
    doc.fillColor(C_GREY).font('Helvetica').fontSize(8)
       .text(data.companyAddress || '', nameX, y + 20, { width: nameW, lineBreak: false })

    y += LOGO_H + 4

    // Title (centered) — matches the client template's "Pay Advice for …" line.
    const titleLine = `Pay Advice for ${monthName} ${data.year ?? ''}${dateRange ? ' ' + dateRange : ''}`
    doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(12)
       .text(titleLine, col1X, y, { width: usableW, align: 'center', lineBreak: false })
    y += 18

    doc.rect(col1X, y, usableW, 3).fill(C_DARK)
    y += 3 + GAP

    // ──────────────────────────────────────────────────────────
    // 2. EMPLOYEE INFO BOX
    // ──────────────────────────────────────────────────────────
    const infoRows: [string, string, string, string][] = [
      ['Name of Employee', data.staffName       || '—', 'Feeder',          data.feeder         || '—'],
      ['Employee Number', data.staffIdCode      || '—', 'Franchise State', data.franchiseState || '—'],
      ['Department',      data.department       || '—', 'NHF Number',      data.nhfNumber      || '—'],
      ['Role',            data.role             || '—', 'PFA',             data.pfaName        || '—'],
      ['Region',          data.regionName       || '—', 'Pension No',      data.pensionNumber  || '—'],
    ]
    const INFO_H = 6 + infoRows.length * INFO_ROW + 8

    doc.rect(col1X, y, usableW, INFO_H).fill(C_LIGHT)
    doc.rect(col1X, y + INFO_H - 2, usableW, 2).fill(C_MID)

    const LBL_W = 80

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
      ['Basic Pay',       data.basicSalary,            false],
      ['Housing',         data.housingAllowance,       false],
      ['Transport',       data.transportAllowance,     false],
      ['Meal Allowance',  data.mealSubsidy,            false],
      ['Furniture',       data.furnitureAllowance,     false],
      ['Utility',         data.utilityAllowance,       false],
      ['Leave Grant',     data.leaveAllowance,         false],
      ['Electricity',     data.electricityAllowance,   false],
      ['Entertainment',   data.entertainmentAllowance, false],
      ['Domestic',        data.domesticAllowance,      false],
      ['Shift Allowance', data.hazardAllowance,        false],
      ['Overtime',        data.overtimeEarnings,       false],
      ['Arrears',         data.arrears,                false],
      ['Total Earnings',  data.grossSalary,            true],
    ]

    const deductRows: [string, number, boolean][] = [
      ['Pension',               data.pensionEmployee, false],
      ['National Housing Fund', data.nhf,             false],
      ['PAYE',                  data.monthlyPAYE,     false],
      ...data.unions.map(u => [u.name, u.amount, false] as [string, number, boolean]),
      ['Loan',                  data.loan || 0,       false],
      ['Ded/Liabilities',       data.deductionLiabilities, false],
      ...data.cooperatives.map(c => [c.name, c.amount, false] as [string, number, boolean]),
      ['Total Deductions',      data.totalDeductions, true],
    ]

    drawMoneyTable(doc, 'Pay Items', earningRows, col1X, y, colW, C_DARK)
    drawMoneyTable(doc, 'Deduction', deductRows,  col2X, y, colW, C_MID)

    const tableH = HDR_H + Math.max(earningRows.length, deductRows.length) * ROW_H
    y += tableH + GAP

    // ──────────────────────────────────────────────────────────
    // 4. SUMMARY — Net Pay / EROBREA / Net Pay plus EROBREA /
    //    Total Earnings Plus EROBREA / Bank-Cash
    // ──────────────────────────────────────────────────────────
    const EROBREA = 0 // additive variable; sourced once the business provides it
    const summaryRows: [string, number | string][] = [
      ['Net Pay',                     data.netSalary],
      ['EROBREA',                     EROBREA],
      ['Net Pay plus EROBREA',        data.netSalary + EROBREA],
      ['Total Earnings Plus EROBREA', data.grossSalary + EROBREA],
      ['Bank/Cash',                   data.bankName || '—'],
    ]
    const SUM_ROW_H = 17
    const SUM_PAD   = 8
    const SUM_H     = SUM_PAD * 2 + summaryRows.length * SUM_ROW_H

    doc.rect(col1X, y, usableW, SUM_H).fill(C_LIGHT)
    doc.rect(col1X, y + SUM_H - 2, usableW, 2).fill(C_MID)

    const sumLabelW = 185
    const sumValueX = col1X + sumLabelW
    const sumValueW = usableW - sumLabelW - 16

    summaryRows.forEach(([label, value], i) => {
      const ry = y + SUM_PAD + i * SUM_ROW_H
      const isNet = i === 0
      doc.fillColor(isNet ? C_DARK : C_GREY).font(isNet ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
         .text(label, col1X + 12, ry + 3, { width: sumLabelW - 12, lineBreak: false })
      if (typeof value === 'number') {
        drawAmount(doc, value, sumValueX, ry + 3, {
          width: sumValueW, align: 'left', font: 'Helvetica-Bold', fontSize: 9, color: C_BLACK,
        })
      } else {
        doc.fillColor(C_BLACK).font('Helvetica-Bold').fontSize(9)
           .text(String(value), sumValueX, ry + 3, { width: sumValueW, lineBreak: false })
      }
    })

    y += SUM_H + GAP

    // ──────────────────────────────────────────────────────────
    // 5. FOOTER — company slogan + generation note
    // ──────────────────────────────────────────────────────────
    doc.strokeColor('#d1d5db').lineWidth(0.5)
       .moveTo(col1X, y).lineTo(col1X + usableW, y).stroke()
    doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(9)
       .text('PLAY TO WIN BY DOING RIGHT', col1X, y + 6,
             { width: usableW, align: 'center', lineBreak: false })
    doc.fillColor(C_GREY).font('Helvetica').fontSize(7)
       .text(
         'This payslip is computer-generated and does not require a signature.',
         col1X, y + 18, { width: usableW, align: 'center', lineBreak: false }
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

  const LABEL_RATIO = 0.62
  const labelW      = width * LABEL_RATIO
  const valueW      = width - labelW - 16

  // Two-column header: section title (left) | Amount (right)
  doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(8)
     .text(title, x + 8, y + 6, { width: labelW - 8, lineBreak: false })
  doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(8)
     .text('Amount', x + labelW, y + 6, { width: valueW, align: 'right', lineBreak: false })

  rows.forEach(([label, value, isTotal], i) => {
    const ry = y + HDR_H + i * ROW_H
    const bg = isTotal ? C_TOTAL : (i % 2 === 0 ? C_WHITE : C_ROW_ALT)
    doc.rect(x, ry, width, ROW_H).fill(bg)

    const ty   = ry + 4
    const font = isTotal ? 'Helvetica-Bold' : 'Helvetica'
    const clr  = isTotal ? C_MID : C_BLACK

    doc.fillColor(clr).font(font).fontSize(8)
       .text(label, x + 8, ty, { width: labelW - 8, lineBreak: false })
    drawAmount(doc, value, x + labelW, ty, {
      width: valueW, align: 'right', font: 'Helvetica-Bold', fontSize: 8, color: clr,
    })
  })
}

function formatAmount(v: number): string {
  return (v || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Renders a currency amount with an "NGN" prefix (no ₦ glyph, so it renders
// identically in every PDF viewer). Supports left and right alignment.
function drawAmount(
  doc:    PDFKit.PDFDocument,
  value:  number,
  x:      number,
  y:      number,
  opts: {
    width:    number
    align?:   'left' | 'right'
    font:     string
    fontSize: number
    color:    string
  },
): void {
  const formatted = `NGN ${formatAmount(value)}`
  doc.font(opts.font).fontSize(opts.fontSize).fillColor(opts.color)
  if (opts.align === 'right' && opts.width) {
    doc.text(formatted, x, y, { width: opts.width, align: 'right', lineBreak: false })
    return
  }
  doc.text(formatted, x, y, { lineBreak: false })
}
