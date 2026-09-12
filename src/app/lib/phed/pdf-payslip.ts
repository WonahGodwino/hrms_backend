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
    // 1. HEADER — company + "Advice for {Month Year}" + period dates
    // ──────────────────────────────────────────────────────────
    const HEADER_H = 70
    doc.rect(col1X, y, usableW, HEADER_H).fill(C_DARK)

    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(14)
       .text(data.companyName || '24/7HR', col1X + 14, y + 12,
             { width: colW - 14, lineBreak: false })
    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text(data.companyAddress || '', col1X + 14, y + 32,
             { width: colW - 14, lineBreak: false })

    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const monthName = (data.month != null && data.month >= 1 && data.month <= 12)
      ? MONTH_NAMES[data.month - 1]
      : data.periodName
    const pad2 = (v: number) => String(v).padStart(2, '0')
    const lastDay = (m: number, yr: number) => new Date(yr, m, 0).getDate()
    const dateRange = (data.month != null && data.year != null)
      ? `(${pad2(1)}/${pad2(data.month)}/${data.year} - ${pad2(lastDay(data.month, data.year))}/${pad2(data.month)}/${data.year})`
      : ''

    doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
       .text(`Advice for ${monthName} ${data.year ?? ''}`, col2X, y + 12,
             { width: colW - 14, align: 'right', lineBreak: false })
    doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(10)
       .text(dateRange || data.periodName, col2X, y + 30,
             { width: colW - 14, align: 'right', lineBreak: false })

    doc.rect(col1X, y + HEADER_H - 3, usableW, 3).fill(C_MID)
    y += HEADER_H + GAP

    // ──────────────────────────────────────────────────────────
    // 2. EMPLOYEE INFO BOX
    // ──────────────────────────────────────────────────────────
    const infoRows: [string, string, string, string][] = [
      ['Name of Employee', data.staffName      || '—', 'Employee Number', data.staffIdCode  || '—'],
      ['Department',       data.department     || '—', 'Role',            data.role         || '—'],
      ['Region',           data.regionName     || '—', 'Feeder',          data.feeder       || '—'],
      ['NHF Number',       data.nhfNumber      || '—', 'PFA',             data.pfaName      || '—'],
      ['Pension No',       data.pensionNumber  || '—', 'Grade',           data.gradeName    || '—'],
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
      ['Basic Pay',               data.basicSalary,            false],
      ['Housing',                 data.housingAllowance,       false],
      ['Transport',               data.transportAllowance,     false],
      ['Furniture',               data.furnitureAllowance,     false],
      ['Domestic',                data.domesticAllowance,      false],
      ['Meal',                    data.mealSubsidy,            false],
      ['Hazard',                  data.hazardAllowance,        false],
      ['Leave Grant',             data.leaveAllowance,         false],
      ['Electricity',             data.electricityAllowance,   false],
      ['Other Allowances',        data.otherAllowances,        false],
      ['Discretionary Allowance', data.discoveryAllowance,     false],
      ['Car Subsidy',             data.carSubsidy,             false],
      ['Entertainment',           data.entertainmentAllowance, false],
      ['Arrears',                 data.arrears,                false],
      ['Overtime',                data.overtimeEarnings,       false],
      ['Total Earnings',          data.grossSalary,            true],
    ]

    const deductRows: [string, number, boolean][] = [
      ['Pension',               data.pensionEmployee, false],
      ['National Housing Fund', data.nhf,             false],
      ['PAYE',                  data.monthlyPAYE,     false],
      ...data.unions.map(u => [u.name, u.amount, false] as [string, number, boolean]),
      ...data.cooperatives.map(c => [c.name, c.amount, false] as [string, number, boolean]),
      ['Insurance',             data.insurance || 0, false],
      ['Ded/Liabilities',       data.deductionLiabilities, false],
      ['Total Deductions',      data.totalDeductions, true],
    ]

    drawMoneyTable(doc, 'EARNINGS',   earningRows, col1X, y, colW, C_DARK)
    drawMoneyTable(doc, 'DEDUCTIONS', deductRows,  col2X, y, colW, C_MID)

    const tableH = HDR_H + Math.max(earningRows.length, deductRows.length) * ROW_H
    y += tableH + GAP

    // ──────────────────────────────────────────────────────────
    // 4. SUMMARY — Net Pay | Total Gross Pay | Bank
    // ──────────────────────────────────────────────────────────
    const BAR_H = 34
    const cellW = (usableW - 2) / 3
    doc.rect(col1X, y, usableW, BAR_H).fill(C_DARK)

    const summaryCells: [string, string | number, boolean][] = [
      ['Net Pay',         data.netSalary,      true],
      ['Total Gross Pay', data.grossSalary,    true],
      ['Bank',            data.bankName || '—', false],
    ]
    summaryCells.forEach(([label, value, isAmount], i) => {
      const cx = col1X + i * (cellW + 1)
      doc.fillColor('#bdd1e8').font('Helvetica').fontSize(8)
         .text(label, cx + 12, y + 5, { width: cellW - 24, lineBreak: false })
      if (isAmount) {
        drawAmount(doc, value as number, cx + 12, y + 17, {
          width: cellW - 24, align: 'left', font: 'Helvetica-Bold', fontSize: 12, color: C_WHITE,
        })
      } else {
        doc.fillColor(C_WHITE).font('Helvetica-Bold').fontSize(12)
           .text(String(value), cx + 12, y + 17, { width: cellW - 24, align: 'left', lineBreak: false })
      }
    })

    y += BAR_H + GAP

    // ──────────────────────────────────────────────────────────
    // 5. FOOTER
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

// Draws a proper ₦ (Naira) symbol with vector strokes so it renders
// correctly in every PDF viewer, regardless of font glyph coverage.
function drawNairaSymbol(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string): void {
  const symbolHeight = Math.max(size, 8)
  const symbolWidth  = symbolHeight * 0.72
  const lineWidth    = Math.max(0.8, symbolHeight * 0.08)
  const barInset     = lineWidth
  const bar1Y        = y + symbolHeight * 0.38
  const bar2Y        = y + symbolHeight * 0.62

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

// Renders a currency amount as a vector-drawn ₦ symbol followed by the
// formatted number. Supports left and right alignment within a width.
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
  const formatted   = formatAmount(value)
  const symbolSize  = Math.max(opts.fontSize * 0.9, 8)
  const symbolGap   = Math.max(opts.fontSize * 0.35, 3)
  const symbolWidth = symbolSize * 0.72 + symbolGap

  doc.font(opts.font).fontSize(opts.fontSize).fillColor(opts.color)

  if (opts.align === 'right' && opts.width) {
    const textWidth = doc.widthOfString(formatted)
    const startX    = x + opts.width - (symbolWidth + textWidth)
    drawNairaSymbol(doc, startX, y + Math.max(opts.fontSize * 0.08, 0.5), symbolSize, opts.color)
    doc.text(formatted, startX + symbolWidth, y, { lineBreak: false })
    return
  }

  drawNairaSymbol(doc, x, y + Math.max(opts.fontSize * 0.08, 0.5), symbolSize, opts.color)
  doc.text(formatted, x + symbolWidth, y, { lineBreak: false })
}
