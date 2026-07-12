// src/app/lib/offers/offer-letter-docx.ts
// Converts a rendered offer-letter HTML document into an editable Word (.docx).
// Reuses the shared headless-Chromium instance (already used for PDF) to walk the
// letter DOM into structured blocks, then emits real OpenXML via the `docx` lib.
// No additional dependencies — both puppeteer and docx are already in the stack.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx'
import { getBrowser } from '@/app/lib/offers/offer-letter-pdf'

type InlineRun = { text: string; bold?: boolean; italic?: boolean }
type Block = {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'hr' | 'header'
  align?: 'left' | 'center' | 'right'
  runs: InlineRun[]
}

// Walks the letter DOM (in the browser context) and returns an ordered list of
// block descriptors with their inline formatting preserved.
async function extractBlocks(fullHtml: string): Promise<{ companyName: string; blocks: Block[] }> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' })
    return await page.evaluate(() => {
      const BLOCK_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'HR'])
      const out: any[] = []

      const inlineRuns = (el: Element): InlineRunLocal[] => {
        const runs: InlineRunLocal[] = []
        const walk = (node: Node, bold: boolean, italic: boolean) => {
          node.childNodes.forEach((child) => {
            if (child.nodeType === 3) {
              const text = (child.textContent || '').replace(/\s+/g, ' ')
              if (text.trim() || text === ' ') runs.push({ text, bold, italic })
            } else if (child.nodeType === 1) {
              const tag = (child as Element).tagName
              const b = bold || tag === 'B' || tag === 'STRONG'
              const i = italic || tag === 'I' || tag === 'EM'
              if (tag === 'BR') runs.push({ text: '\n', bold: b, italic: i })
              else walk(child, b, i)
            }
          })
        }
        walk(el, false, false)
        return runs
      }

      interface InlineRunLocal { text: string; bold?: boolean; italic?: boolean }

      const co = document.querySelector('.letter-head .co .name')
      const companyName = (co?.textContent || '').trim()

      const body = document.querySelector('.letter-body') || document.body
      const blockEls = body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,hr')
      blockEls.forEach((el) => {
        const tag = el.tagName
        if (tag === 'HR') {
          out.push({ type: 'hr', runs: [] })
          return
        }
        const runs = inlineRuns(el)
        if (!runs.length) return
        const style = window.getComputedStyle(el)
        const align =
          style.textAlign === 'center'
            ? 'center'
            : style.textAlign === 'right'
              ? 'right'
              : 'left'
        let type = 'p'
        if (tag === 'H1') type = 'h1'
        else if (tag === 'H2') type = 'h2'
        else if (tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') type = 'h3'
        else if (tag === 'LI') type = 'li'
        out.push({ type, align, runs })
      })

      // Suppress unused-var lints in the browser context.
      void BLOCK_TAGS
      return { companyName, blocks: out }
    })
  } finally {
    await page.close().catch(() => {})
  }
}

// Maps our inline runs into docx TextRuns, splitting on embedded newlines.
function toTextRuns(runs: InlineRun[]): TextRun[] {
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
  const { companyName, blocks } = await extractBlocks(fullHtml)

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
    if (b.type === 'hr') {
      children.push(new Paragraph({ text: '', border: { bottom: { color: 'E2E8F0', space: 1, style: 'single', size: 6 } } }))
      return
    }
    if (b.type === 'h1' || b.type === 'h2') {
      children.push(
        new Paragraph({
          heading: b.type === 'h1' ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          alignment: alignmentOf(b.align),
          children: toTextRuns(b.runs),
        })
      )
      return
    }
    if (b.type === 'h3') {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, alignment: alignmentOf(b.align), children: toTextRuns(b.runs) })
      )
      return
    }
    if (b.type === 'li') {
      children.push(new Paragraph({ bullet: { level: 0 }, children: toTextRuns(b.runs) }))
      return
    }
    children.push(new Paragraph({ alignment: alignmentOf(b.align), children: toTextRuns(b.runs) }))
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
