// src/app/lib/payroll/payslip-preset-renderer.ts
//
// Renders payslip PDFs from company-scoped HTML "Payslip Presets"
// (PayslipPreset rows in the database). A preset is an HTML document with
// {{placeholder}} tokens; this module interpolates real payroll data into
// it and prints the result to PDF via puppeteer (already a project
// dependency, also used by the org-chart export).
//
// Token system (safe by design - no code execution, HTML-escaped values):
//   {{companyName}} {{companyTagline}} {{companyAddress}} {{companyPhone}}
//   {{payslipTitle}} {{payPeriod}} {{generatedDate}}
//   {{staffName}} {{staffId}} {{position}} {{department}} {{email}}
//   {{daysWorked}} {{daysInMonth}} {{daysRange}}
//   {{bankName}} {{accountNumber}} {{pfa}} {{rsaPin}} {{taxId}}
//   {{currency}} - currency code (e.g. NGN)
//   {{currencySymbol}} - symbol for the company's currency (₦, $, £, ...)
//   {{#earnings}}{{label}}{{amount}}{{/earnings}} - repeated block
//   {{#deductions}}{{label}}{{amount}}{{/deductions}}
//   {{grossSalary}} {{totalDeductions}} {{netSalary}} {{netSalaryPlain}}
//   {{grossWithSymbol}} {{totalDeductionsSymbol}} {{netSalaryWithSymbol}}
//   {{companyFooter}} - "Name - Address - Tel: phone" one-liner
// Conditionals: {{#if token}}...{{/if}} renders the body only when the
//   named value is non-empty — lets a layout hide rows whose field has no
//   value (e.g. no PFA recorded) instead of printing a blank label.
// Unknown tokens render as empty strings, never raw template code.
import puppeteer, { type Browser } from 'puppeteer'

export type PresetEarningsItem = { label: string; amount: number }
export type PresetDeductionsItem = { label: string; amount: number }

export type PayslipPresetContext = {
  staffName: string
  staffId: string
  position: string
  department: string
  email: string
  payPeriodMonth: number
  payPeriodYear: number
  daysWorked: number
  daysInMonth: number
  bankName: string
  accountNumber: string
  pfa: string
  rsaPin: string
  taxId: string
  currency: string
  earnings: PresetEarningsItem[]
  deductions: PresetDeductionsItem[]
  grossSalary: number
  totalDeductions: number
  netSalary: number
  companyName: string
  companyTagline: string
  companyAddress: string
  companyPhone: string
  // Company logo as a base64 data URI ('' when the company has none) —
  // rendered in place of the company name by layouts that support it.
  companyLogo: string
  payslipTitle: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function getMonthName(monthNumber: number): string {
  return MONTHS[monthNumber - 1] || 'Unknown'
}

// Escape for safe HTML interpolation.
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Format money with thousands separators, no symbol - symbol styling is the
// template's business (e.g. "NGN 430,976.38" or a styled naira span).
function money(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// The currency symbol comes from the company's currency setup —
// normalizeCurrencyCode resolves the code (defaulting to NGN) and
// getCurrencySymbol maps it to the display symbol via Intl.
import { getCurrencySymbol, normalizeCurrencyCode } from '@/app/lib/currency'

// Interpolate a preset HTML document with the context. Handles the two
// repeating blocks ({{#earnings}}...{{/earnings}}, {{#deductions}}...),
// which expose {{label}} and {{amount}} (formatted) plus {{amountPlain}}
// (raw number) inside, the {{#if token}}...{{/if}} conditional helper, then
// all single tokens.
export function interpolatePresetHtml(html: string, ctx: PayslipPresetContext): string {
  const repeats: Record<string, { label: string; amount: number }[]> = {
    earnings: ctx.earnings,
    deductions: ctx.deductions
  }

  // 1) Repeating blocks first.
  let out = html.replace(/\{\{#(earnings|deductions)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, name: string, body: string) => {
    const items = repeats[name] || []
    return items
      .map((item) =>
        body
          .replace(/\{\{\s*label\s*\}\}/g, esc(item.label))
          .replace(/\{\{\s*amount\s*\}\}/g, esc(money(item.amount)))
          .replace(/\{\{\s*amountPlain\s*\}\}/g, esc(item.amount))
      )
      .join('')
  })

  // 2) Company footer helper.
  const footerBits = [ctx.companyName, ctx.companyAddress, ctx.companyPhone ? `Tel: ${ctx.companyPhone}` : ''].filter(Boolean)
  const companyFooter = footerBits.join(' - ')

  const currencyCode = normalizeCurrencyCodeSafe(ctx.currency)
  const symbol = getCurrencySymbol(currencyCode)

  // 3) Single tokens.
  const singles: Record<string, string> = {
    companyName: esc(ctx.companyName),
    companyTagline: esc(ctx.companyTagline),
    companyAddress: esc(ctx.companyAddress),
    companyPhone: esc(ctx.companyPhone),
    companyFooter: esc(companyFooter),
    // Raw data-URI for the company logo (empty string when the company has
    // none) — used as an <img> src by the layout.
    companyLogo: esc(ctx.companyLogo),
    payslipTitle: esc(ctx.payslipTitle || 'Employee Payslip'),
    payPeriod: esc(`${getMonthName(ctx.payPeriodMonth)} ${ctx.payPeriodYear}`),
    generatedDate: esc(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })),
    staffName: esc(ctx.staffName),
    staffId: esc(ctx.staffId),
    position: esc(ctx.position),
    department: esc(ctx.department),
    email: esc(ctx.email),
    daysWorked: esc(ctx.daysWorked),
    daysInMonth: esc(ctx.daysInMonth),
    daysRange: esc(`${ctx.daysWorked} / ${ctx.daysInMonth}`),
    bankName: esc(ctx.bankName),
    accountNumber: esc(ctx.accountNumber),
    pfa: esc(ctx.pfa),
    rsaPin: esc(ctx.rsaPin),
    taxId: esc(ctx.taxId),
    currency: esc(ctx.currency),
    currencySymbol: esc(symbol),
    // Guard tokens for the layout's conditionals: non-empty string = present.
    hasEarnings: ctx.earnings.length > 0 ? '1' : '',
    hasDeductions: ctx.deductions.length > 0 ? '1' : '',
    hasDays: ctx.daysWorked > 0 ? '1' : '',
    hasCompanyLogo: ctx.companyLogo ? '1' : '',
    grossSalary: esc(money(ctx.grossSalary)),
    totalDeductions: esc(money(ctx.totalDeductions)),
    netSalary: esc(money(ctx.netSalary)),
    netSalaryPlain: esc(ctx.netSalary),
    grossWithSymbol: esc(`${symbol} ${money(ctx.grossSalary)}`),
    totalDeductionsSymbol: esc(`${symbol} ${money(ctx.totalDeductions)}`),
    netSalaryWithSymbol: esc(`${symbol} ${money(ctx.netSalary)}`)
  }

  // 4) {{#if token}}...{{/if}} — render the body only when the named value
  // is non-empty (after whitespace trim). Supports {{else}} for the inverse
  // branch. Runs before plain token substitution so the guard tokens are
  // consumed here; unknown guard tokens resolve to empty, dropping the block.
  out = out.replace(/\{\{#if\s+([a-zA-Z]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key: string, body: string) => {
    const value = singles[key]
    const truthy = !!(value && value.trim())
    const elseSplit = body.split(/\{\{\s*else\s*\}\}/)
    const consequent = elseSplit[0] ?? ''
    const alternate = elseSplit.slice(1).join('')
    return truthy ? consequent : alternate
  })

  // 5) Plain single tokens last.
  out = out.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_m, key: string) => (key in singles ? singles[key] : ''))

  return out
}

// Local re-export of the currency normalizer (kept dependency-light here).
function normalizeCurrencyCodeSafe(code?: string | null): string {
  try {
    return normalizeCurrencyCode(code || 'NGN')
  } catch {
    return 'NGN'
  }
}

// ---- Puppeteer printing ---------------------------------------------------
// A shared browser keeps per-payslip cost at a page render, not a Chrome
// launch. Lazily created; recreated if a previous instance died.
let browserPromise: Promise<Browser> | null = null

// Chrome resolution: puppeteer's own resolution first (env var, download
// cache), then common system installs as fallback — keeps rendering working
// on hosts where `puppeteer browsers install` was never run.
function resolveChromeExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH
  try {
    const exe = puppeteer.executablePath()
    if (exe && require('fs').existsSync(exe)) return exe
  } catch {
    // fall through to system candidates
  }
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'
  const candidates: string[] = []
  if (isWin) {
    candidates.push(
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    )
  } else if (isMac) {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    )
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium')
  }
  try {
    const fs = require('fs') as typeof import('fs')
    return candidates.find((c) => fs.existsSync(c))
  } catch {
    return undefined
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        executablePath: resolveChromeExecutable(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      })
      .catch((err) => {
        browserPromise = null
        throw err
      })
  }
  return browserPromise
}

export async function renderPresetHtmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    await page.emulateMediaType('screen')
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' }
    })
    return new Uint8Array(pdf)
  } finally {
    await page.close()
  }
}

export async function renderPresetPayslip(
  htmlTemplate: string,
  ctx: PayslipPresetContext
): Promise<{ pdfBuffer: Uint8Array; fileName: string }> {
  const html = interpolatePresetHtml(htmlTemplate, ctx)
  const pdfBuffer = await renderPresetHtmlToPdf(html)
  const fileName = `payslip-${ctx.staffId}-${String(ctx.payPeriodMonth).padStart(2, '0')}-${ctx.payPeriodYear}.pdf`
  return { pdfBuffer, fileName }
}

// Validation used by the preset CRUD API: a preset must contain at least the
// net salary token so it can never silently print an empty payslip.
const REQUIRED_TOKENS = ['netSalary']

export function validatePresetHtml(html: string): { ok: true } | { ok: false; reason: string } {
  if (!html || typeof html !== 'string' || !html.trim()) return { ok: false, reason: 'HTML content is required' }
  if (!/<html|<body|<div/i.test(html)) return { ok: false, reason: 'Content does not look like an HTML document' }
  for (const token of REQUIRED_TOKENS) {
    if (!new RegExp(`\{\{\s*${token}\s*\}\}`).test(html)) {
      return { ok: false, reason: `Missing required token {{${token}}}` }
    }
  }
  return { ok: true }
}

// ---- Unified dispatch -----------------------------------------------------
// Single integration point for the payslip pipeline: every call site that
// today calls generateEnhancedPayslipPdf directly calls this instead. When
// the payroll template has a PayslipPreset selected (payslipPresetHtml
// provided), the payslip is rendered from the preset's HTML layout via
// puppeteer; otherwise the built-in PDFKit generator runs, byte-for-byte
// unchanged. The context is built from the SAME input the built-in
// generator would receive, so the numbers on a preset payslip can never
// differ from the numbers a default payslip would show.
import { generateEnhancedPayslipPdf, type GeneratePayslipInput } from './generateEnhancedPayslipPdf'

export type PresetAwarePayslipInput = GeneratePayslipInput & {
  // HTML of the company's selected PayslipPreset — presence switches the
  // render path. Callers fetch it once per upload/run via
  // getActivePresetHtml below.
  payslipPresetHtml?: string | null
  // Bank/pension identifiers for preset token support ({{bankName}} etc.).
  // Optional and additive — the built-in generator ignores them.
  staff: GeneratePayslipInput['staff'] & {
    bankName?: string
    accountNumber?: string
    pfa?: string
    rsaPin?: string
  }
}

// Resolves the active preset HTML for a payroll template (null = use the
// built-in default layout). Returns null when no preset is selected, the
// preset row is missing, or it has been deactivated.
export async function getActivePresetHtml(presetId?: string | null): Promise<string | null> {
  if (!presetId) return null
  try {
    // Lazy import keeps this module loadable outside a configured Next runtime
    // (scripts, tests) and avoids a hard DB dependency at import time.
    const { prisma } = await import('@/app/lib/db')
    const preset = await prisma.payslipPreset.findUnique({
      where: { id: presetId },
      select: { isActive: true, htmlContent: true }
    })
    if (!preset || !preset.isActive) return null
    return preset.htmlContent
  } catch (error) {
    console.error('[PAYSIP_PRESET] Failed to load preset, falling back to default layout:', error)
    return null
  }
}

function buildPresetContext(input: PresetAwarePayslipInput): PayslipPresetContext {
  const { staff, payroll, companyInfo, earnings, deductions, summary } = input

  // Zero-value lines are dropped: a field with no value must not appear on
  // the payslip (same rule as the empty detail rows).
  const earningsItems: PresetEarningsItem[] =
    earnings && earnings.length > 0
      ? earnings.map((item) => ({ label: item.label, amount: Number(item.value) || 0 })).filter((item) => item.amount !== 0)
      : [
          { label: 'Basic Salary', amount: payroll.proratedGrossPay ?? payroll.basicSalary ?? 0 },
          { label: 'Housing Allowance', amount: payroll.housingAllowance ?? 0 },
          { label: 'Transport Allowance', amount: payroll.transportAllowance ?? payroll.transportationAllowance ?? 0 },
          { label: 'Bonus', amount: payroll.bonusKPI ?? 0 },
          { label: 'Overtime', amount: payroll.overtimeIncome ?? 0 }
        ].filter((item) => item.amount > 0)

  const deductionsItems: PresetDeductionsItem[] =
    deductions && deductions.length > 0
      ? deductions.map((item) => ({ label: item.label, amount: Number(item.value) || 0 })).filter((item) => item.amount !== 0)
      : [
          { label: 'PAYE', amount: payroll.payee ?? 0 },
          { label: 'Pension', amount: payroll.pension ?? 0 },
          { label: 'Other Deductions', amount: payroll.deductions ?? 0 }
        ].filter((item) => item.amount > 0)

  const grossSalary = summary?.grossPay ?? payroll.grossPay ?? earningsItems.reduce((s, i) => s + i.amount, 0)
  const totalDeductions = summary?.totalDeductions ?? deductionsItems.reduce((s, i) => s + i.amount, 0)
  const netSalary = summary?.netPay ?? payroll.netPay ?? grossSalary - totalDeductions

  return {
    staffName: `${staff.firstName} ${staff.lastName}`.trim() || payroll.fullName || staff.staffId,
    staffId: staff.staffId,
    position: payroll.position || staff.position || staff.designation || '',
    department: staff.department || '',
    email: staff.email || payroll.email || '',
    payPeriodMonth: payroll.periodMonth,
    payPeriodYear: payroll.periodYear,
    daysWorked: payroll.daysWorked ?? 0,
    daysInMonth: payroll.daysInMonth ?? 0,
    bankName: staff.bankName || '',
    accountNumber: staff.accountNumber || '',
    pfa: staff.pfa || '',
    rsaPin: staff.rsaPin || '',
    taxId: staff.companyTaxId || companyInfo?.taxId || '',
    currency: normalizeCurrencyCodeSafe(companyInfo?.baseCurrency || staff.baseCurrency),
    earnings: earningsItems,
    deductions: deductionsItems,
    grossSalary,
    totalDeductions,
    netSalary,
    companyName: companyInfo?.name || staff.companyName || '',
    companyTagline: '',
    companyAddress: companyInfo?.address || staff.companyAddress || '',
    companyPhone: companyInfo?.phone || staff.companyPhone || '',
    companyLogo: companyInfo?.logo || staff.companyLogo || '',
    payslipTitle: 'Employee Payslip'
  }
}

export async function generatePayslipPdfUnified(
  input: PresetAwarePayslipInput
): Promise<{ pdfBuffer: Uint8Array; fileName: string }> {
  if (input.payslipPresetHtml) {
    const ctx = buildPresetContext(input)
    return renderPresetPayslip(input.payslipPresetHtml, ctx)
  }
  return generateEnhancedPayslipPdf(input)
}

// ---- Sample context (preset preview) --------------------------------------
// Realistic dummy data mirroring the payslip-preset-1 sample PDF, used by
// the preset preview endpoint so an HR can visually verify a layout before
// putting it into production.
export function buildSampleContext(): PayslipPresetContext {
  const now = new Date()
  return {
    staffName: 'Beta HR',
    staffId: 'BETA-HR-001',
    position: 'Human Resource',
    department: 'Human Resources',
    email: 'beta.hr@example.com',
    payPeriodMonth: now.getMonth() + 1,
    payPeriodYear: now.getFullYear(),
    daysWorked: 22,
    daysInMonth: 24,
    bankName: 'Bank Name',
    accountNumber: '0000000000',
    pfa: 'PFA Name',
    rsaPin: 'PEN000000000000',
    taxId: 'TIN 00000000-0000',
    currency: 'NGN',
    earnings: [
      { label: 'Basic salary', amount: 218181.82 },
      { label: 'Housing allowance', amount: 163636.37 },
      { label: 'Transport allowance', amount: 163636.37 },
      { label: 'Bonus', amount: 2000 },
      { label: 'Overtime', amount: 10000 }
    ],
    deductions: [
      { label: 'PAYE', amount: 82841.82 },
      { label: 'Pension', amount: 43636.36 }
    ],
    grossSalary: 557454.56,
    totalDeductions: 126478.18,
    netSalary: 430976.38,
    companyName: 'Beta Logistics',
    companyTagline: 'LOGISTICS & SUPPLY CHAIN',
    companyAddress: 'Abuja',
    companyPhone: '+234 809 876 5432',
    companyLogo: '',
    payslipTitle: 'Employee Payslip'
  }
}
