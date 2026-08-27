// src/app/lib/offer-letters/bulkEditProcessing.ts
//
// Per-row processing for an offer-letter bulk-edit upload. Every field is
// validated first; if anything is wrong, one combined error is thrown before
// any database transaction opens (cheap fail-fast). The actual regenerate-
// and-save then happens inside a single prisma.$transaction, so a failure at
// any step — including the document render itself — rolls the whole row
// back with zero partial writes. This is the literal implementation of
// "invalidate the entire row on any failure."
import { prisma } from '@/app/lib/db'
import { renderDocx, MissingOfferLetterVariableError } from './docxTemplate'
import { buildOfferLetterFieldLabels } from './variableLabels'

export async function processOfferLetterBulkEditRow(
  row: Record<string, any>,
  companyId: string,
  templateFileData: Buffer,
  templateVariables: string[],
  userId: string
): Promise<void> {
  const letterId = String(row.letterId ?? '').trim()
  if (!letterId) {
    throw new Error('Missing letterId — this row cannot be matched to an offer letter.')
  }

  // Blank cells mean "keep the existing value" — only non-empty cells are
  // treated as edits.
  const edits: Record<string, string> = {}
  for (const key of templateVariables) {
    const raw = row[key]
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      edits[key] = String(raw).trim()
    }
  }

  const recipientNameRaw = row.recipientName
  const recipientEmailRaw = row.recipientEmail
  const monthRaw = row.month
  const yearRaw = row.year

  await prisma.$transaction(async (tx) => {
    const letter = await tx.generatedOfferLetter.findFirst({ where: { id: letterId, companyId } })
    if (!letter) {
      throw new Error(`Letter "${letterId}" was not found in this company.`)
    }

    const mergedValues: Record<string, string> = { ...((letter.variableValues as Record<string, string>) || {}), ...edits }
    const missing = templateVariables.filter((key) => !mergedValues[key] || String(mergedValues[key]).trim() === '')
    if (missing.length > 0) {
      const labels = buildOfferLetterFieldLabels(templateVariables)
      throw new Error(`Missing values for: ${missing.map((key) => labels.get(key)).join(', ')}`)
    }

    const recipientName = recipientNameRaw && String(recipientNameRaw).trim() ? String(recipientNameRaw).trim() : letter.recipientName
    const recipientEmail = recipientEmailRaw && String(recipientEmailRaw).trim() ? String(recipientEmailRaw).trim() : letter.recipientEmail
    const month = monthRaw && String(monthRaw).trim() ? String(monthRaw).trim() : letter.month
    const yearParsed =
      yearRaw !== undefined && yearRaw !== null && String(yearRaw).trim() !== '' ? parseInt(String(yearRaw), 10) : letter.year
    if (Number.isNaN(yearParsed)) {
      throw new Error('Invalid year value.')
    }

    let generatedBytes: Buffer
    try {
      generatedBytes = renderDocx(templateFileData, mergedValues)
    } catch (err) {
      if (err instanceof MissingOfferLetterVariableError) {
        throw new Error(err.message)
      }
      throw err
    }

    const safeName = recipientName.replace(/[^a-zA-Z0-9]+/g, '_')
    const fileName = `${safeName}-${month}-${yearParsed}.docx`

    await tx.generatedOfferLetter.update({
      where: { id: letterId },
      data: {
        recipientName,
        recipientEmail,
        variableValues: mergedValues,
        fileData: generatedBytes as any,
        fileName,
        fileSize: generatedBytes.length,
        month,
        year: yearParsed,
        status: 'REGENERATED',
        updatedBy: userId,
      },
    })
  })
}
