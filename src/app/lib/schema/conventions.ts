// Database type conventions (DB-004), checked against prisma/schema.prisma by
// tests/schema/conventions.test.ts. See docs/engineering/database-conventions.md.
//
// Two rules:
//  1. Money is never `Float`: a Float field whose name looks like money fails, unless it is listed in
//     FLOAT_NOT_MONEY (a percentage or count that only sounds like money).
//  2. Status, type, kind, role and category fields are enums: a `String` field with one of those names fails,
//     unless it is in the shrink-only baseline (backend/schema-string-status-baseline.txt) of fields that
//     already existed when the rule was added.

export type SchemaField = { model: string; field: string; type: string }

const MONEY_NAME = /(pay|salary|amount|cost|price|fee|budget|total|gross|net|tax|deduction|allowance|bonus|wage)/i
const STATUS_NAME = /(^(status|type|kind|role|category)$)|(Status|Type|Kind|Role|Category)$/

/** Float fields whose names sound like money but are not amounts. */
export const FLOAT_NOT_MONEY: ReadonlySet<string> = new Set([
  'Offer.bonusPercentage', // a percentage of salary, not an amount
])

/** Scalar String and Float fields of every model in a Prisma schema. */
export function scalarFields(schema: string): SchemaField[] {
  const out: SchemaField[] = []
  let model: string | null = null
  for (const line of schema.replace(/\r\n/g, '\n').split('\n')) {
    const start = line.match(/^model (\w+) \{/)
    if (start) {
      model = start[1]
      continue
    }
    if (/^\}/.test(line)) {
      model = null
      continue
    }
    if (!model) continue
    const f = line.match(/^\s+(\w+)\s+(String|Float)(\?|\[\])?(\s|$)/)
    if (f) out.push({ model, field: f[1], type: f[2] })
  }
  return out
}

export const fieldKey = (f: SchemaField) => `${f.model}.${f.field}`

/** Float fields that look like money and are not known exceptions. */
export function moneyFloats(fields: SchemaField[]): string[] {
  return fields
    .filter((f) => f.type === 'Float' && MONEY_NAME.test(f.field))
    .map(fieldKey)
    .filter((k) => !FLOAT_NOT_MONEY.has(k))
}

/** String fields named like a status, type, kind, role or category. */
export function stringStatusFields(fields: SchemaField[]): string[] {
  return fields.filter((f) => f.type === 'String' && STATUS_NAME.test(f.field)).map(fieldKey)
}

/** Lines of a baseline file, ignoring blank lines and # comments. */
export function baselineEntries(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}
