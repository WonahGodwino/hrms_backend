// src/app/lib/reporting/chart-render.ts
//
// Server-side chart-to-PNG renderer for embedding real chart images into
// Excel summary sheets (exceljs has no native chart-object API). Hand-builds
// SVG for the small set of chart types the Reporting module actually needs
// (bar, line, pie) using the app's own brand palette, then rasterizes with
// `sharp` — which bundles librsvg, so no extra native chart library or
// browser/canvas dependency is needed.
import sharp from 'sharp';

type ChartSeries = { name: string; color?: string; values: number[] };
export type ChartSpec = {
	type: 'bar' | 'line' | 'pie';
	title?: string;
	labels: string[];
	series: ChartSeries[];
	width?: number;
	height?: number;
	valueFormatter?: (value: number) => string;
};

const DEFAULT_WIDTH = 680;
const DEFAULT_HEIGHT = 380;
const PALETTE = ['#6C5DD3', '#20c997', '#ff7a59', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];

function seriesColor(series: ChartSeries, index: number): string {
	return series.color || PALETTE[index % PALETTE.length];
}

function escapeXml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function niceMax(value: number): number {
	if (value <= 0) return 1;
	const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
	const normalized = value / magnitude;
	let niceNormalized;
	if (normalized <= 1) niceNormalized = 1;
	else if (normalized <= 2) niceNormalized = 2;
	else if (normalized <= 5) niceNormalized = 5;
	else niceNormalized = 10;
	return niceNormalized * magnitude;
}

function defaultFormatter(value: number): string {
	if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
	return String(Math.round(value * 100) / 100);
}

export async function renderChartPng(spec: ChartSpec): Promise<Buffer> {
	const svg = buildSvg(spec);
	return sharp(Buffer.from(svg)).png().toBuffer();
}

function buildSvg(spec: ChartSpec): string {
	const width = spec.width || DEFAULT_WIDTH;
	const height = spec.height || DEFAULT_HEIGHT;
	if (spec.type === 'pie') return buildPieSvg(spec, width, height);
	if (spec.type === 'line') return buildAxisSvg(spec, width, height, 'line');
	return buildAxisSvg(spec, width, height, 'bar');
}

function chartFrame(width: number, height: number, title: string | undefined, inner: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  ${title ? `<text x="${width / 2}" y="24" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#1e293b" text-anchor="middle">${escapeXml(title)}</text>` : ''}
  ${inner}
</svg>`;
}

function buildAxisSvg(spec: ChartSpec, width: number, height: number, kind: 'bar' | 'line'): string {
	const format = spec.valueFormatter || defaultFormatter;
	const margin = { top: spec.title ? 48 : 20, right: 24, bottom: spec.series.length > 1 ? 56 : 40, left: 56 };
	const plotW = width - margin.left - margin.right;
	const plotH = height - margin.top - margin.bottom;

	const allValues = spec.series.flatMap((s) => s.values.map((v) => Number(v) || 0));
	const rawMax = Math.max(0, ...allValues);
	const max = niceMax(rawMax || 1);
	const gridLines = 4;

	let gridSvg = '';
	for (let i = 0; i <= gridLines; i++) {
		const value = (max / gridLines) * i;
		const y = margin.top + plotH - (value / max) * plotH;
		gridSvg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`;
		gridSvg += `<text x="${margin.left - 8}" y="${y + 4}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#64748b" text-anchor="end">${escapeXml(format(value))}</text>`;
	}

	const categoryCount = spec.labels.length || 1;
	const categoryWidth = plotW / categoryCount;

	let dataSvg = '';
	if (kind === 'bar') {
		const groupPadding = categoryWidth * 0.2;
		const barsPerGroup = spec.series.length || 1;
		const groupWidth = categoryWidth - groupPadding * 2;
		const barWidth = groupWidth / barsPerGroup;
		spec.series.forEach((series, si) => {
			const color = seriesColor(series, si);
			series.values.forEach((raw, ci) => {
				const value = Number(raw) || 0;
				const barH = max > 0 ? (value / max) * plotH : 0;
				const x = margin.left + ci * categoryWidth + groupPadding + si * barWidth;
				const y = margin.top + plotH - barH;
				dataSvg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(barWidth - 2, 1).toFixed(1)}" height="${Math.max(barH, 0).toFixed(1)}" fill="${color}" rx="2" />`;
			});
		});
	} else {
		spec.series.forEach((series, si) => {
			const color = seriesColor(series, si);
			const points = series.values.map((raw, ci) => {
				const value = Number(raw) || 0;
				const x = margin.left + ci * categoryWidth + categoryWidth / 2;
				const y = margin.top + plotH - (max > 0 ? (value / max) * plotH : 0);
				return { x, y };
			});
			const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
			dataSvg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" />`;
			points.forEach((p) => {
				dataSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${color}" />`;
			});
		});
	}

	let xLabelsSvg = '';
	spec.labels.forEach((label, ci) => {
		const x = margin.left + ci * categoryWidth + categoryWidth / 2;
		const y = margin.top + plotH + 16;
		const truncated = label.length > 14 ? `${label.slice(0, 13)}…` : label;
		xLabelsSvg += `<text x="${x.toFixed(1)}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#475569" text-anchor="middle">${escapeXml(truncated)}</text>`;
	});

	let legendSvg = '';
	if (spec.series.length > 1) {
		const legendY = height - 14;
		let legendX = margin.left;
		spec.series.forEach((series, si) => {
			const color = seriesColor(series, si);
			legendSvg += `<rect x="${legendX}" y="${legendY - 9}" width="10" height="10" fill="${color}" rx="2" />`;
			legendSvg += `<text x="${legendX + 14}" y="${legendY}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#334155">${escapeXml(series.name)}</text>`;
			legendX += 14 + series.name.length * 6 + 18;
		});
	}

	const axisLine = `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#94a3b8" stroke-width="1" />`;

	return chartFrame(width, height, spec.title, `${gridSvg}${axisLine}${dataSvg}${xLabelsSvg}${legendSvg}`);
}

function buildPieSvg(spec: ChartSpec, width: number, height: number): string {
	const format = spec.valueFormatter || defaultFormatter;
	const series = spec.series[0] || { name: '', values: [] };
	const values = series.values.map((v) => Number(v) || 0);
	const total = values.reduce((a, b) => a + b, 0);

	const cx = width * 0.34;
	const cy = height / 2 + (spec.title ? 10 : 0);
	const radius = Math.min(cx, height / 2) - 30;

	let pathSvg = '';
	let startAngle = -Math.PI / 2;
	const slices = spec.labels.map((label, i) => {
		const value = values[i] || 0;
		const fraction = total > 0 ? value / total : 0;
		const endAngle = startAngle + fraction * Math.PI * 2;
		const color = PALETTE[i % PALETTE.length];
		const x1 = cx + radius * Math.cos(startAngle);
		const y1 = cy + radius * Math.sin(startAngle);
		const x2 = cx + radius * Math.cos(endAngle);
		const y2 = cy + radius * Math.sin(endAngle);
		const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
		if (fraction > 0) {
			pathSvg += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" stroke="#ffffff" stroke-width="1.5" />`;
		}
		const slice = { label, value, fraction, color };
		startAngle = endAngle;
		return slice;
	});

	const legendX = cx + radius + 32;
	let legendSvg = '';
	slices.forEach((slice, i) => {
		const y = cy - radius + i * 20;
		legendSvg += `<rect x="${legendX}" y="${y - 9}" width="10" height="10" fill="${slice.color}" rx="2" />`;
		legendSvg += `<text x="${legendX + 14}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="10.5" fill="#334155">${escapeXml(slice.label)} — ${format(slice.value)} (${(slice.fraction * 100).toFixed(1)}%)</text>`;
	});

	return chartFrame(width, height, spec.title, `${pathSvg}${legendSvg}`);
}
