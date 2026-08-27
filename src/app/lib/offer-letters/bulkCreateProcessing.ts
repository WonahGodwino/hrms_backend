// src/app/lib/offer-letters/bulkCreateProcessing.ts
//
// Per-row processing for a bulk offer-letter CREATE upload. Every field is
// validated first (all combined into one error message so the failure
// report shows the full picture for that row, not just the first problem);
// only if everything is valid does the row get rendered and inserted. On
// failure, nothing is written — there's no existing row to roll back,
// unlike bulk-edit's transactional update.
import { prisma } from '@/app/lib/db'
import { renderDocx, MissingOfferLetterVariableError } from './docxTemplate'
import { buildOfferLetterFieldLabels, BASE_FIELD_KEYS } from './variableLabels'

export async function processOfferLetterBulkCreateRow(
  row: Record<string, any>,
  companyId: string,
  templateId: string,
  templateFileData: Buffer,
  templateVariables: string[],
  userId: string
): Promise<void> {
  const labels = buildOfferLetterFieldLabels([...BASE_FIELD_KEYS, ...templateVariables])

  const recipientName = String(row.recipientName ?? '').trim()
  const recipientEmail = String(row.recipientEmail ?? '').trim()
  const month = String(row.month ?? '').trim()
  const yearRaw = row.year

  const problems: string[] = []
  if (!recipientName) problems.push(`${labels.get('recipientName')} is required`)
  if (!recipientEmail) problems.push(`${labels.get('recipientEmail')} is required`)
  if (!month) problems.push(`${labels.get('month')} is required`)

  const yearParsed =
    yearRaw !== undefined && yearRaw !== null && String(yearRaw).trim() !== '' ? parseInt(String(yearRaw), 10) : NaN
  if (Number.isNaN(yearParsed)) problems.push(`${labels.get('year')} is required and must be a number`)

  const values: Record<string, string> = {}
  for (const key of templateVariables) {
    const raw = row[key]
    const value = raw !== undefined && raw !== null ? String(raw).trim() : ''
    if (!value) {
      problems.push(`${labels.get(key)} is required`)
    }
    values[key] = value
  }

  if (problems.length > 0) {
    throw new Error(problems.join('; '))
  }

  let generatedBytes: Buffer
  try {
    generatedBytes = renderDocx(templateFileData, values)
  } catch (err) {
    if (err instanceof MissingOfferLetterVariableError) {
      throw new Error(err.message)
    }
    throw err
  }

  const safeName = recipientName.replace(/[^a-zA-Z0-9]+/g, '_')
  const fileName = `${safeName}-${month}-${yearParsed}.docx`

  await prisma.generatedOfferLetter.create({
    data: {
      companyId,
      templateId,
      recipientName,
      recipientEmail,
      variableValues: values,
      fileData: generatedBytes as any,
      fileName,
      fileSize: generatedBytes.length,
      month,
      year: yearParsed,
      createdBy: userId,
    },
  })
}
