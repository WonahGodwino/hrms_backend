// src/app/lib/payroll/upload/rowErrors.ts

/** Splits the stored "Row N: message" strings into structured per-row errors for the Results step. */
export function splitRowErrors(lines: string[]) {
  const rowErrors: { row: number; message: string }[] = []
  const notes: string[] = []
  for (const line of lines) {
    const m = /^Row (\d+): ([\s\S]*)$/.exec(line)
    if (m) rowErrors.push({ row: Number(m[1]), message: m[2] })
    else notes.push(line)
  }
  return { rowErrors: rowErrors.slice(0, 1000), rowErrorsTruncated: rowErrors.length > 1000, notes }
}
