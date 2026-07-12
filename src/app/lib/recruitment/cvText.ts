// Best-effort plain-text extraction from an uploaded CV (PDF / DOCX), used to
// populate JobApplication.parsedCvContent so the AI / keyword CV review has real
// input. Returns '' on unsupported types or any failure — extraction must never
// break an application submission.

function normalize(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 50000) // guardrail against pathological inputs
}

// Legacy .doc (OLE binary) has no pure-JS parser in the stack, so recover the
// readable text runs from the buffer (best-effort). Tries UTF-16LE (common for
// Word text) and Latin-1, keeping whichever yields more readable content.
function extractLegacyDocText(buffer: Buffer): string {
  const runFromRuns = (s: string) => (s.match(/[\x20-\x7E]{4,}/g) || []).join(' ')
  let text = runFromRuns(buffer.toString('latin1'))
  try {
    const utf16 = runFromRuns(buffer.toString('utf16le'))
    if (utf16.length > text.length) text = utf16
  } catch {
    /* ignore decode issues */
  }
  return text
}

export async function extractCvText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  const isPdf = mimeType === 'application/pdf' || ext === 'pdf'
  const isDocx =
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  const isDoc = (mimeType === 'application/msword' || ext === 'doc') && !isDocx

  try {
    if (isPdf) {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      try {
        const result = await parser.getText()
        return normalize(result.text)
      } finally {
        await parser.destroy().catch(() => {})
      }
    }

    if (isDocx) {
      const mammoth = await import('mammoth')
      const result = await (mammoth as any).extractRawText({ buffer })
      return normalize(result.value)
    }

    if (isDoc) {
      return normalize(extractLegacyDocText(buffer))
    }

    // Other/unknown formats aren't parsable here.
    return ''
  } catch (e: any) {
    console.error('CV text extraction failed:', e?.message)
    return ''
  }
}
