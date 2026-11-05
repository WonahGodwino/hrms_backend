// Stamps "247HR Trial" diagonally across every page of a generated PDF, plus a
// footer line, for companies on a free trial. Paid and legacy companies get the
// bytes back untouched. Never throws: a watermark failure must not block the
// document, so the original bytes are returned instead.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { getTrialState } from './guard'

export async function watermarkPdfIfTrial(
  companyId: string | null | undefined,
  pdf: Uint8Array | Buffer,
): Promise<Uint8Array> {
  const bytes = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf)
  try {
    const state = await getTrialState(companyId)
    if (!state.restricted) return bytes

    const doc = await PDFDocument.load(bytes)
    const font = await doc.embedFont(StandardFonts.HelveticaBold)
    const code = (companyId || '').slice(-6).toUpperCase()

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize()
      const text = '247HR Trial'
      const size = Math.min(width, height) * 0.16
      const textWidth = font.widthOfTextAtSize(text, size)
      // Rotate about the page centre so the mark runs bottom-left to top-right.
      page.drawText(text, {
        x: width / 2 - (textWidth / 2) * Math.cos(Math.PI / 6),
        y: height / 2 - (textWidth / 2) * Math.sin(Math.PI / 6),
        size,
        font,
        color: rgb(0.8, 0.8, 0.8),
        opacity: 0.45,
        rotate: degrees(30),
      })
      page.drawText(`247HR Trial - not valid for payroll or hiring - ref ${code}`, {
        x: 24,
        y: 12,
        size: 8,
        font,
        color: rgb(0.45, 0.45, 0.45),
      })
    }
    return await doc.save()
  } catch (err) {
    console.error('[TRIAL] watermark failed, returning original PDF', err)
    return bytes
  }
}
