// src/app/lib/reporting/excel-export.ts
//
// Shared, currency-aware Excel workbook builder for the (non-PHED) Reporting
// module — Finance, Staff Insights, Attendance, Leave. Modeled on PHED's
// proven pattern (backend/src/app/lib/phed/report-export.ts): per-cell
// header fill (never a row-level fill — that's the bug this whole redesign
// fixes on-screen too), alternating data rows, a styled totals row, a
// frozen header, and a confidential footer. Extends that pattern with:
// multi-sheet workbooks, a prepended "Summary" sheet carrying KPI callouts
// and embedded chart images (via chart-render.ts + sharp), and currency
// symbols resolved from the company's own `baseCurrency` instead of a
// hardcoded number format.
import ExcelJS from 'exceljs';

import { getCurrencySymbol } from '@/app/lib/currency';
import { XL, buildSubtitle } from '@/app/lib/excel/sheet-theme';

import { renderChartPng, type ChartSpec } from './chart-render';

export interface ReportColumn {
	header: string;
	key: string;
	width?: number;
	type: 'text' | 'currency' | 'integer' | 'number' | 'percent' | 'plainNumber';
}

interface ReportSheet {
	name: string;
	displayTitle?: string;
	columns: ReportColumn[];
	rows: Record<string, any>[];
	totals?: boolean; // default true
}

interface ReportKpi {
	label: string;
	value: string | number;
}

export interface ReportWorkbookOptions {
	title: string;
	subtitle?: string;
	companyName?: string;
	currency?: string; // ISO code, default 'NGN'
	sheets?: ReportSheet[];
	kpis?: ReportKpi[];
	charts?: ChartSpec[];
	summarySheetName?: string; // default 'Summary'
}

// Shared with every other generated sheet (see lib/excel/sheet-theme.ts).
const BRAND_BLUE = XL.BRAND_DEEP;
const BRAND_DARK = XL.BRAND;
const ACCENT_BLUE = XL.TINT;
const GREY_ROW = XL.ZEBRA;

function numFmtFor(type: ReportColumn['type'], currency: string): string | undefined {
	switch (type) {
		case 'currency':
			return `"${getCurrencySymbol(currency)}"#,##0.00`;
		case 'number':
			return '#,##0.00';
		case 'integer':
			return '#,##0';
		case 'plainNumber':
			return '0';
		case 'percent':
			return '0.0"%"';
		default:
			return undefined;
	}
}

function isNumericType(type: ReportColumn['type']): boolean {
	return type === 'currency' || type === 'number' || type === 'integer' || type === 'percent' || type === 'plainNumber';
}

function writeDataSheet(wb: ExcelJS.Workbook, sheet: ReportSheet, opts: ReportWorkbookOptions) {
	const currency = opts.currency || 'NGN';
	const ws = wb.addWorksheet(sheet.name.substring(0, 31));
	const cols = sheet.columns;
	ws.columns = cols.map((c) => ({ key: c.key, width: c.width || 18 }));

	// Row 1: title
	ws.mergeCells(1, 1, 1, cols.length);
	const titleCell = ws.getCell('A1');
	titleCell.value = sheet.displayTitle || `${opts.title}, ${sheet.name}`;
	titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
	titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_DARK}` } };
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(1).height = 28;

	// Row 2: meta
	ws.mergeCells(2, 1, 2, cols.length);
	const metaCell = ws.getCell('A2');
	metaCell.value = buildSubtitle([opts.companyName, opts.subtitle]);
	metaCell.font = { size: 10, color: { argb: `FF${XL.INK}` } };
	metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } };
	metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(2).height = 20;

	// Row 3: headers — per-cell fill, never row-level.
	const hdrRow = ws.getRow(3);
	cols.forEach((c, i) => {
		const cell = hdrRow.getCell(i + 1);
		cell.value = c.header;
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_BLUE}` } };
		cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
		cell.alignment = { horizontal: c.type === 'text' ? 'left' : 'right', vertical: 'middle' };
		cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
	});
	hdrRow.height = 22;

	// Rows 4+: data
	sheet.rows.forEach((row, ri) => {
		const dataRow = ws.getRow(ri + 4);
		const isEven = ri % 2 === 1;
		cols.forEach((c, ci) => {
			const cell = dataRow.getCell(ci + 1);
			const value = row[c.key];
			cell.value = value ?? (c.type === 'text' ? '' : 0);
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? `FF${GREY_ROW}` : 'FFFFFFFF' } };
			cell.font = { size: 10, color: { argb: 'FF1f2937' } };
			cell.alignment = { horizontal: c.type === 'text' ? 'left' : 'right', vertical: 'middle' };
			const numFmt = numFmtFor(c.type, currency);
			if (numFmt) cell.numFmt = numFmt;
		});
		dataRow.height = 18;
	});

	// Totals row
	const showTotals = sheet.totals !== false && sheet.rows.length > 0;
	if (showTotals) {
		const totalsRowIdx = sheet.rows.length + 4;
		const totalsRow = ws.getRow(totalsRowIdx);
		cols.forEach((c, ci) => {
			const cell = totalsRow.getCell(ci + 1);
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } };
			cell.border = { top: { style: 'medium', color: { argb: `FF${BRAND_BLUE}` } } };
			if (isNumericType(c.type) && c.type !== 'percent') {
				const total = sheet.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
				cell.value = total;
				const numFmt = numFmtFor(c.type, currency);
				if (numFmt) cell.numFmt = numFmt;
				cell.font = { bold: true, size: 10, color: { argb: `FF${BRAND_BLUE}` } };
				cell.alignment = { horizontal: 'right', vertical: 'middle' };
			} else if (ci === 0) {
				cell.value = 'TOTAL';
				cell.font = { bold: true, size: 10, color: { argb: `FF${BRAND_BLUE}` } };
				cell.alignment = { horizontal: 'left', vertical: 'middle' };
			} else {
				cell.value = '';
			}
		});
		totalsRow.height = 22;
	}

	// Footer
	const footerRowIdx = sheet.rows.length + (showTotals ? 5 : 4);
	ws.mergeCells(footerRowIdx, 1, footerRowIdx, cols.length);
	const footerCell = ws.getCell(footerRowIdx, 1);
	footerCell.value = opts.companyName
		? `This document is generated by ${opts.companyName}, it is confidential and intended for authorized use only.`
		: 'This document is confidential and intended for authorized use only.';
	footerCell.font = { italic: true, size: 8, color: { argb: 'FF9ca3af' } };
	footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(footerRowIdx).height = 16;

	ws.views = [{ state: 'frozen', ySplit: 3 }];
}

async function writeSummarySheet(wb: ExcelJS.Workbook, opts: ReportWorkbookOptions) {
	const kpis = opts.kpis || [];
	const charts = opts.charts || [];
	if (kpis.length === 0 && charts.length === 0) return;

	const name = (opts.summarySheetName || 'Summary').substring(0, 31);
	const ws = wb.addWorksheet(name);

	const colSpan = Math.max(kpis.length, 1) * 2;
	ws.columns = Array.from({ length: colSpan }, () => ({ width: 16 }));

	ws.mergeCells(1, 1, 1, colSpan);
	const titleCell = ws.getCell('A1');
	titleCell.value = opts.title;
	titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
	titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_DARK}` } };
	titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(1).height = 34;

	ws.mergeCells(2, 1, 2, colSpan);
	const metaCell = ws.getCell('A2');
	metaCell.value = buildSubtitle([opts.companyName, opts.subtitle]);
	metaCell.font = { italic: true, size: 10, color: { argb: 'FF374151' } };
	metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } };
	metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
	ws.getRow(2).height = 22;

	let nextRow = 4;
	if (kpis.length > 0) {
		const kpiRow = nextRow;
		const valueRow = nextRow + 1;
		ws.getRow(kpiRow).height = 20;
		ws.getRow(valueRow).height = 28;
		kpis.forEach((kpi, i) => {
			const startCol = i * 2 + 1;
			ws.mergeCells(kpiRow, startCol, kpiRow, startCol + 1);
			const labelCell = ws.getCell(kpiRow, startCol);
			labelCell.value = kpi.label;
			labelCell.font = { bold: true, size: 9, color: { argb: 'FF64748b' } };
			labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_BLUE}` } };
			labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

			ws.mergeCells(valueRow, startCol, valueRow, startCol + 1);
			const valueCell = ws.getCell(valueRow, startCol);
			valueCell.value = kpi.value;
			valueCell.font = { bold: true, size: 15, color: { argb: `FF${BRAND_BLUE}` } };
			valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
			valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
			valueCell.border = { bottom: { style: 'medium', color: { argb: `FF${BRAND_BLUE}` } } };
		});
		nextRow = valueRow + 2;
	}

	for (const chart of charts) {
		try {
			const png = await renderChartPng(chart);
			const imgWidth = chart.width || 680;
			const imgHeight = chart.height || 380;
			const imageId = wb.addImage({ buffer: png as any, extension: 'png' });
			ws.addImage(imageId, {
				tl: { col: 0, row: nextRow - 1 },
				ext: { width: imgWidth, height: imgHeight },
			});
			// Advance past the image (~20px per row) plus a small gap.
			nextRow += Math.ceil(imgHeight / 20) + 2;
		} catch (err) {
			// A single bad chart shouldn't fail the whole export — the rest of
			// the workbook (KPIs, data sheets) is still useful without it.
			console.error('[excel-export] chart render failed, skipping:', err);
		}
	}

	ws.getRow(3).height = 4; // small spacer under the meta row
}

export async function buildReportWorkbook(opts: ReportWorkbookOptions): Promise<Buffer> {
	const wb = new ExcelJS.Workbook();
	wb.creator = '24/7HR';
	wb.created = new Date();

	// Summary sheet (KPIs + charts) is written first so it's the sheet that
	// opens by default when the workbook is opened.
	await writeSummarySheet(wb, opts);
	for (const sheet of opts.sheets || []) {
		writeDataSheet(wb, sheet, opts);
	}

	return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}
