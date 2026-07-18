// src/app/lib/offers/offer-letter-docx.ts
// Converts a rendered offer-letter HTML document into an editable Word (.docx).
// Parses the HTML directly (no headless browser) using the same block-parser
// that the PDF renderer uses, then emits real OpenXML via the `docx` lib.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx'
import { parseHtml, parseInline } from '@/app/lib/offers/offer-letter-pdf'
import type { Block, InlineSegment } from '@/app/lib/offers/offer-letter-pdf'

// Extracts the company name from the letterhead portion of the HTML.
function extractCompanyName(html: string): string {
  const m = /<div\s+class="co"[^>]*>[\s\S]*?<div\s+class="name"[^>]*>([\s\S]*?)<\/div>/i.exec(html)
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : ''
}

// Maps our inline runs into docx TextRuns.
function toTextRuns(runs: InlineSegment[]): TextRun[] {
  const result: TextRun[] = []
  runs.forEach((r) => {
    const parts = r.text.split('\n')
    parts.forEach((part, idx) => {
      result.push(
        new TextRun({
          text: part,
          bold: r.bold,
          italics: r.italic,
          break: idx > 0 ? 1 : undefined,
        })
      )
    })
  })
  return result
}

function alignmentOf(a?: string) {
  if (a === 'center') return AlignmentType.CENTER
  if (a === 'right') return AlignmentType.RIGHT
  return AlignmentType.LEFT
}

export async function htmlToDocx(fullHtml: string): Promise<Buffer> {
  const companyName = extractCompanyName(fullHtml)
  const blocks = parseHtml(fullHtml)

  const children: Paragraph[] = []

  // Company header (mirrors the letterhead name in the PDF).
  if (companyName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: companyName, bold: true, size: 28 })],
      })
    )
    children.push(new Paragraph({ text: '', border: { bottom: { color: '0F172A', space: 1, style: 'single', size: 12 } } }))
  }

  blocks.forEach((b) => {
    if (b.type === 'divider') {
      children.push(new Paragraph({ text: '', border: { bottom: { color: 'E2E8F0', space: 1, style: 'single', size: 6 } } }))
      return
    }
    const runs = parseInline(b.html)
    if (!runs.length) return

    if (b.type === 'h1' || b.type === 'h2') {
      children.push(
        new Paragraph({
          heading: b.type === 'h1' ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          alignment: alignmentOf(b.align),
          children: toTextRuns(runs),
        })
      )
      return
    }
    if (b.type === 'h3') {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, alignment: alignmentOf(b.align), children: toTextRuns(runs) })
      )
      return
    }
    if (b.type === 'li') {
      children.push(new Paragraph({ bullet: { level: 0 }, children: toTextRuns(runs) }))
      return
    }
    children.push(new Paragraph({ alignment: alignmentOf(b.align), children: toTextRuns(runs) }))
  })

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [{ children }],
  })

  return Packer.toBuffer(doc)
}
