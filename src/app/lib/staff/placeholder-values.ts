// src/app/lib/staff/placeholder-values.ts
//
// Older staff imports saved blank spreadsheet cells as filler values — most
// commonly "0" (an empty formula cell), but also "-", "N/A", "null", etc. —
// into free-text columns like department, position and phone. Those then
// showed up verbatim in Staff Management ("Department: 0") and, worse, the
// department/designation sync would happily create a department named "0".
//
// cleanStaffText treats any of those fillers as "no value" so every read
// and sync path can fall back to the real linked record (or show "—").

export const PLACEHOLDER_TEXT_VALUES = ['0', '0.0', '00', '-', '--', '—', '.', 'n/a', 'na', 'nil', 'null', 'none', 'undefined', '#n/a'];
const PLACEHOLDER_VALUES = new Set(PLACEHOLDER_TEXT_VALUES);

export function isPlaceholderValue(raw: unknown): boolean {
	if (raw === null || raw === undefined) return true;
	const s = String(raw).replace(/\s+/g, ' ').trim().toLowerCase();
	return s === '' || PLACEHOLDER_VALUES.has(s);
}

/** Trimmed text, or null when the value is blank or a filler like "0". */
export function cleanStaffText(raw: unknown): string | null {
	if (isPlaceholderValue(raw)) return null;
	return String(raw).trim();
}
