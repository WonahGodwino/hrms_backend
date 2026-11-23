// src/app/lib/staff/nameFormat.ts
//
// One formatting pass for person names, shared by every path that writes
// firstName/middleName/lastName (manual add, bulk upload, bulk edit, edit
// drawer). Without it, the same name could land in different cases
// depending on how the source typed it (upload sheet vs. a manual edit),
// which then breaks the staff directory search for anyone typing a full
// name that spans more than one of those columns.

export function formatPersonName(value: string): string {
	const collapsed = value.trim().replace(/\s+/g, ' ');
	if (!collapsed) return collapsed;

	return collapsed
		.split(' ')
		.map((word) =>
			word
				.split('-')
				.map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
				.join('-')
		)
		.join(' ');
}
