// Which Payroll column (nsitf / itf / nhf) a template field feeds.
//
// A field set to the NSITF, ITF or NHF system calculator always maps to its
// column. Otherwise (manual fields on uploaded templates) a field whose name
// is clearly NSITF, ITF or NHF maps too, so uploaded payrolls show up in the
// statutory reports alongside generated ones.

export type StatutoryScheme = 'nsitf' | 'itf' | 'nhf';
export const STATUTORY_SCHEMES: StatutoryScheme[] = ['nsitf', 'itf', 'nhf'];

export const STATUTORY_COLUMN_BY_CALCULATOR: Record<string, StatutoryScheme> = {
	NIGERIA_NSITF: 'nsitf',
	NIGERIA_ITF: 'itf',
	NIGERIA_NHF: 'nhf',
};

type FieldLike = { systemField?: string | null; displayName?: string | null; valueSource?: string | null; formulaConfig?: unknown };

const squash = (text: string | null | undefined) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function schemeFromName(text: string | null | undefined): StatutoryScheme | null {
	const t = squash(text);
	if (!t) return null;
	if (t.includes('nsitf')) return 'nsitf';
	if (t === 'itf' || t.startsWith('itf') || t.endsWith('itf')) return 'itf';
	if (t.includes('nhf') || t.includes('nationalhousingfund')) return 'nhf';
	return null;
}

export function statutorySchemeForField(field: FieldLike): StatutoryScheme | null {
	const calculator = field.valueSource === 'SYSTEM_CALC' ? (field.formulaConfig as { calculator?: string } | null)?.calculator : undefined;
	if (calculator) return STATUTORY_COLUMN_BY_CALCULATOR[calculator] || null;
	return schemeFromName(field.systemField) || schemeFromName(field.displayName);
}

/** Schemes a template calculates or carries a column for. */
export function statutorySchemesOnTemplate(fields: FieldLike[]): Set<StatutoryScheme> {
	const found = new Set<StatutoryScheme>();
	for (const f of fields || []) {
		const scheme = statutorySchemeForField(f);
		if (scheme) found.add(scheme);
	}
	return found;
}
