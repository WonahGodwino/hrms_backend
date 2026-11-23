// Shared cell-to-string conversion for parsing uploaded offer-letter sheets.
//
// Every variable — dates included — is just plain text as far as this module
// is concerned: whatever the cell contains gets stringified and handed
// straight to the template, no format detection or guessing involved. The
// one thing that can't just be `String(value)`'d is a native JS `Date`
// object (which ExcelJS returns for cells it recognizes as date-formatted;
// stringifying it directly produces a verbose timestamp, not the plain date
// someone typed), so that's the only case handled specially — rendered as a
// plain DD/MM/YYYY string and nothing more.
type CellLike = { value: unknown }

function formatDate(date: Date): string {
	// ExcelJS constructs date values at UTC midnight regardless of server
	// timezone, so read the UTC calendar fields, not local ones.
	const dd = String(date.getUTCDate()).padStart(2, '0')
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
	const yyyy = date.getUTCFullYear()
	return `${dd}/${mm}/${yyyy}`
}

export function cellToString(cellOrValue: CellLike | unknown): string {
	const isCellLike = typeof cellOrValue === 'object' && cellOrValue !== null && 'value' in (cellOrValue as object)
	const value = (isCellLike ? (cellOrValue as CellLike).value : cellOrValue) as unknown

	if (value === null || value === undefined) return ''
	if (value instanceof Date) return formatDate(value)
	if (typeof value === 'object' && Array.isArray((value as any)?.richText)) {
		return (value as any).richText.map((t: any) => t?.text || '').join('').trim()
	}
	if (typeof value === 'object' && (value as any)?.result !== undefined) {
		return cellToString((value as any).result)
	}
	if (typeof value === 'object') return ''
	return String(value).trim()
}
