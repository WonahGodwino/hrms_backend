// Helpers for app/api/payroll/generate/[runId]/download/route.ts (CODE-004: moved out of the route file).
import { NIGERIA_PAYE_2025_BANDS } from '@/app/lib/payroll/generation/paye-calculator'

export function normalizeSection(section: string): string {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_');
}

export function isDeductionsSection(section: string): boolean {
  return normalizeSection(section) === 'DEDUCTIONS'
}

export function isEmployerCostSection(section: string): boolean {
  return normalizeSection(section) === 'EMPLOYER_COST'
}

// calculator produced a given field, read from the template's own field


export function columnLetter(colIndex: number): string {
  let n = colIndex
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// against the stored number before the formula is embedded.
export const round2 = (n: number) => Math.round(n * 100) / 100;

// computation. `taxable` is an absolute cell reference (e.g. "$AA$12").
export function payeBandFormula(taxable: string): string {
  let expr = '0';
  let prev = 0;
  for (const band of NIGERIA_PAYE_2025_BANDS) {
    if (band.rate === 0) {
      if (band.upTo !== null) prev = band.upTo;
      continue;
    }
    const slice =
      band.upTo === null
        ? `MAX(0,${taxable}-${prev})`
        : `MIN(MAX(0,${taxable}-${prev}),${band.upTo - prev})`;
    expr += `+${slice}*${band.rate}`;
    if (band.upTo === null) return expr;
    prev = band.upTo;
  }
  return expr;
}

// brand-purple title band and headers, tinted meta/totals bands, banded rows.
export const THEME = {
  accent: 'FF6C5DD3',
  brandBlue: 'FF5843BE',
  brandDark: 'FF6C5DD3',
  accentBlue: 'FFEFECFB',
  greyRow: 'FFFAFBFF',
  headerFill: 'FF5843BE',
  headerText: 'FFFFFFFF',
  textDark: 'FF1B1B2F',
  textGrey: 'FF1B1B2F',
  zebra: 'FFFAFBFF',
  border: 'FFE7E8F1',
  white: 'FFFFFFFF'
} as const

export function thinBorder(colorArgb: string = THEME.border) {
  const side = { style: 'thin' as const, color: { argb: colorArgb } }
  return { top: side, left: side, bottom: side, right: side }
}
