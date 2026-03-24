// src/app/lib/fileParser.ts

// Parse PDF buffer into plain text
export async function parsePdf(fileBuffer: Buffer): Promise<string> {
  // Dynamic import to avoid TS / ESM default-export issues
  const pdfModule: any = await import('pdf-parse')
  const pdfParse = pdfModule.default || pdfModule

  const data = await pdfParse(fileBuffer)
  return typeof data?.text === 'string' ? data.text : ''
}

// Parse DOCX buffer into plain text
export async function parseDocx(fileBuffer: Buffer): Promise<string> {
  // Mammoth is also CommonJS in many setups, so treat it the same way
  const mammothModule: any = await import('mammoth')
  const mammoth = mammothModule.default || mammothModule

  const result = await mammoth.extractRawText({ buffer: fileBuffer })
  return typeof result?.value === 'string' ? result.value : ''
}

// Parse plain text / CSV buffer into string
export async function parseText(fileBuffer: Buffer): Promise<string> {
  return fileBuffer.toString('utf-8')
}

/**
 * High-level helper: detect file type (PDF / DOCX / TXT / CSV)
 * and return extracted text.
 *
 * Use this in your recruitment module, e.g.:
 *   const text = await parseFileToText(buffer, file.type, file.name)
 */
export async function parseFileToText(
  fileBuffer: Buffer,
  mimeType?: string,
  fileName?: string
): Promise<string> {
  const lowerName = (fileName || '').toLowerCase()
  const type = (mimeType || '').toLowerCase()

  // PDF
  if (type.includes('pdf') || lowerName.endsWith('.pdf')) {
    return parsePdf(fileBuffer)
  }

  // DOCX (Office Open XML)
  if (
    type.includes('word') ||
    type.includes('officedocument.wordprocessingml.document') ||
    lowerName.endsWith('.docx')
  ) {
    return parseDocx(fileBuffer)
  }

  // Plain text / CSV
  if (
    type.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.csv')
  ) {
    return parseText(fileBuffer)
  }

  // Fallback: try to decode as UTF-8, otherwise return empty string
  try {
    return fileBuffer.toString('utf-8')
  } catch {
    return ''
  }
}
