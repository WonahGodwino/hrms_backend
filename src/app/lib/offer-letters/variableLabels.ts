// Human-readable Excel column labels for offer-letter template variables.
//
// Templates use dotted variable paths internally (e.g. "offer.effectiveDate")
// because that's what's typed into the .docx as {{offer.effectiveDate}}. HR
// users filling in a spreadsheet shouldn't have to read that — they should
// see "Effective Date". The mapping is never persisted: every route that
// needs it (create-sheet, bulk-create/upload, bulk-edit/template,
// bulk-edit/upload, the failure-report generator) recomputes it fresh from
// the template's *current* `variables` list at the moment it's needed, so
// there's exactly one source of truth and nothing that can go stale or fall
// out of sync with what the sheet actually contains.
//
// (An earlier version of this module tried to make reconciliation "exact" by
// writing the raw key into a hidden second header row and trusting it
// blindly. That was worse: a user editing the visible header row by hand —
// inserting a column, retyping a label — has no way to keep a row they can't
// see in sync, so the hidden row silently drifted out of alignment and
// mapped columns to the wrong variable. Recomputing labels fresh from the
// template and matching leniently against the visible text has no hidden
// state to desync in the first place.)
//
// Matching is normalized (case, whitespace, and punctuation insensitive) so
// "Effective Date", "effective date", and "EffectiveDate" all resolve the
// same way.
//
// Collision handling: two variables can share a last segment (e.g.
// "offer.location" and "job.location" both end in "location"). Stripping the
// prefix for both would make the mapping ambiguous, so any key whose short
// label collides with another key's falls back to the full dotted path
// ("Offer Location" / "Job Location") instead.

export const BASE_FIELD_KEYS = ['recipientName', 'recipientEmail', 'month', 'year'] as const

// Columns that always pass through as literal keys, never variables to
// humanize: letterId is a system identifier, row/error are the failure
// report's own bookkeeping columns.
export const PASSTHROUGH_COLUMN_KEYS = ['letterId', 'row', 'error']

const KNOWN_ACRONYMS = new Set(['hr', 'id', 'kpi', 'vat', 'url', 'ceo', 'cfo', 'coo', 'cto'])

// Words that read as dangerously generic on their own in a form full of
// other "name"/"title"-ish fields (e.g. "Name" next to "Recipient Name" and
// "Full Name") — genuinely likely for someone to retype for clarity even
// though there's no actual collision. Always keep these qualified with
// their parent segment so the label is self-explanatory and never needs a
// human to "fix" it into something the mapping can no longer recognize.
const ALWAYS_QUALIFY_LAST_SEGMENTS = new Set(['name', 'title', 'description', 'id', 'type', 'status', 'value', 'code'])

function humanizeWord(segment: string): string {
	const spaced = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
	return spaced
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((w) => (KNOWN_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
		.join(' ')
}

function lastSegment(key: string): string {
	const parts = key.split('.')
	return parts[parts.length - 1]
}

function fullPathLabel(key: string): string {
	return key
		.split('.')
		.map(humanizeWord)
		.join(' ')
}

/** Case/whitespace/punctuation-insensitive comparison key for a label. */
function slugify(text: string): string {
	return String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '')
}

/**
 * key -> display label for every key in `keys` together, so collisions
 * across the whole set (base fields + template variables) are caught, not
 * just within one group.
 */
export function buildOfferLetterFieldLabels(keys: string[]): Map<string, string> {
	const shortLabels = new Map(keys.map((k) => [k, humanizeWord(lastSegment(k))]))

	const countByShortLabel = new Map<string, number>()
	for (const label of shortLabels.values()) {
		countByShortLabel.set(label, (countByShortLabel.get(label) || 0) + 1)
	}

	const result = new Map<string, string>()
	for (const key of keys) {
		const short = shortLabels.get(key) as string
		const hasDot = key.includes('.')
		const isGenericWord = hasDot && ALWAYS_QUALIFY_LAST_SEGMENTS.has(lastSegment(key).toLowerCase())
		const needsFullPath = (countByShortLabel.get(short) || 0) > 1 || isGenericWord
		result.set(key, needsFullPath ? fullPathLabel(key) : short)
	}
	return result
}

/** slug(label) -> key, for lenient matching of whatever text actually appears in an uploaded sheet's header row. */
export function buildSlugToKeyMap(keys: string[]): Map<string, string> {
	const labels = buildOfferLetterFieldLabels(keys)
	const map = new Map<string, string>()
	for (const [key, label] of labels.entries()) {
		map.set(slugify(label), key)
	}
	return map
}

/**
 * Resolves a sheet's header row to the raw keys renderDocx / the row
 * processors expect, matching leniently (case/whitespace/punctuation
 * insensitive) against labels recomputed from the template's current
 * variables. A header that doesn't match anything recognized — including one
 * that's already a raw key (e.g. a hand-edited sheet) or a bookkeeping
 * column like "row"/"error" from a failure report — passes through
 * unchanged, since downstream code only reads keys it recognizes anyway.
 */
export function resolveHeaderLabelsToKeys(headers: string[], keys: string[]): string[] {
	const slugToKey = buildSlugToKeyMap(keys)
	return headers.map((h) => {
		const text = String(h || '')
		const slug = slugify(text)
		return slugToKey.get(slug) || text
	})
}
