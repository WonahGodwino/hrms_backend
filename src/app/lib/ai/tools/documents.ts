// [ai-assistant] Document tool — draft_document (read-only context provider).
import type { ToolDefinition } from './types'
import { redactSensitive } from '../redact'

export const draftDocument: ToolDefinition = {
  name: 'draft_document',
  description: 'Gather context for drafting a company document (letter, memo, notice, policy excerpt). The AI composes the text in its response — this tool only provides the company and staff context needed. Specify the document type and any staff members involved.',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', description: 'Type of document to draft', enum: ['letter', 'memo', 'notice', 'warning', 'confirmation', 'other'] },
      subject: { type: 'string', description: 'Brief subject of the document' },
      staff: { type: 'string', description: 'Staff number or email if the document concerns a specific person' },
    },
    required: ['type', 'subject'],
  },
  async execute(args, ctx) {
    const company = await ctx.prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: { companyName: true, email: true, phone: true, address: true, website: true },
    })

    // Only fields from visible categories are passed on: names and email need personal data, job details need employment data.
    // When they are hidden the draft uses bracketed placeholders for the person to fill in.
    let staff: Record<string, unknown> | null = null
    if (args.staff) {
      const ref = String(args.staff).trim()
      const record = await ctx.prisma.staffRecord.findFirst({
        where: { companyId: ctx.companyId, OR: [{ staffId: ref }, { email: { equals: ref, mode: 'insensitive' } }] },
        select: { firstName: true, lastName: true, email: true, position: true, department: true, hireDate: true, staffId: true },
      })
      if (!record) return { error: 'No staff member found for that staff number or email' }
      const personal = ctx.visibleCategories.includes('personal')
      const employment = ctx.visibleCategories.includes('employment')
      staff = {
        ...(personal ? { name: `${record.firstName} ${record.lastName}`.trim(), email: record.email } : { name: '[Employee name]' }),
        ...(employment ? { staffNumber: record.staffId, position: record.position, department: record.department, hireDate: record.hireDate } : { position: '[Position]', department: '[Department]', hireDate: '[Hire date]' }),
      }
    }
    return {
      documentType: args.type,
      subject: args.subject,
      company,
      staff,
      instruction: 'Use the company and staff context above to compose the document. Return the full text in your response. Do not create files.',
    }
  },
}

const MAX_COLUMNS = 8
const MAX_ROWS = 50
const MAX_CELL = 200

const cell = (v: unknown) => redactSensitive(String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, MAX_CELL)

// summarise lays out a result the assistant already has as a short report: a title, a table and a few notes. It reads no data of its own.
// Every cell is passed through the sensitive-value filter, so a report can never carry an account number, salary figure or phone number.
export const summarise: ToolDefinition = {
  name: 'summarise',
  description:
    'Lay out a result you already have as a short report with a table, which the person can copy or download. Pass the figures you got from other tools; this tool does not look anything up. At most 8 columns and 50 rows; every row needs one value per column.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Report title' },
      columns: { type: 'array', items: { type: 'string' }, description: 'Column headings' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Rows of values, one value per column, as text' },
      notes: { type: 'array', items: { type: 'string' }, description: 'Short bullet points under the table (optional)' },
    },
    required: ['title', 'columns', 'rows'],
  },
  async execute(args) {
    const title = cell(args.title)
    const columns = Array.isArray(args.columns) ? (args.columns as unknown[]).map(cell) : []
    const rawRows = Array.isArray(args.rows) ? (args.rows as unknown[]) : []
    if (!title) return { error: 'Provide a title.' }
    if (!columns.length || columns.some((c) => !c)) return { error: 'Provide a heading for every column.' }
    if (columns.length > MAX_COLUMNS) return { error: `A report can have at most ${MAX_COLUMNS} columns.` }
    if (!rawRows.length) return { error: 'Provide at least one row.' }
    if (rawRows.length > MAX_ROWS) return { error: `A report can have at most ${MAX_ROWS} rows. Summarise further, then try again.` }
    const rows: string[][] = []
    for (const r of rawRows) {
      if (!Array.isArray(r) || r.length !== columns.length) return { error: `Every row needs exactly ${columns.length} values, one per column.` }
      rows.push((r as unknown[]).map(cell))
    }
    const notes = Array.isArray(args.notes) ? (args.notes as unknown[]).map(cell).filter(Boolean).slice(0, 8) : []
    return { report: { title, columns, rows, notes }, instruction: 'The report is shown to the person as a table with copy and download. Do not repeat the whole table in your reply; add one or two sentences on what it shows.' }
  },
}