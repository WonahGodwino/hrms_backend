// src/app/lib/offers/offer-letter-pdf.ts
// Renders the offer letter HTML to a PDF Buffer using PDFKit (pure Node.js,
// no headless Chrome / Puppeteer). Eliminates the "Could not find Chrome"
// error that users hit when Puppeteer's browser isn't installed.
//
// The input is the same print-ready HTML that the Puppeteer renderer consumed
// (letterhead + body + watermark + signature). This parser strips HTML tags and
// maps common elements (h1-h3, p, ul/li, strong, em, br, hr, img) to PDFKit
// drawing commands, producing a professional A4 PDF.
import PDFDocument from 'pdfkit'
import path from 'path'

// ---------------------------------------------------------------------------
// Font resolution (same strategy as the payslip generator)
// ---------------------------------------------------------------------------
let _regularFont: string | null = null
let _boldFont: string | null = null
let _italicFont: string | null = null

function resolveFonts() {
  if (_regularFont) return

  const cwd = process.cwd()
  const candidates = {
    regular: [
      path.join(cwd, 'public', 'payslips', 'fonts', 'LiberationSans-Regular.ttf'),
      path.join(cwd, 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Regular.ttf'),
    ],
    bold: [
      path.join(cwd, 'public', 'payslips', 'fonts', 'LiberationSans-Bold.ttf'),
      path.join(cwd, 'node_modules', 'pdfjs-dist', 'standard_fonts', 'LiberationSans-Bold.ttf'),
    ],
    italic: [
      path.join(cwd, 'public', 'payslips', 'fonts', 'LiberationSans-Italic.ttf'),
    ],
  }

  for (const p of candidates.regular) { try { require('fs').accessSync(p); _regularFont = p; break } catch {} }
  for (const p of candidates.bold) { try { require('fs').accessSync(p); _boldFont = p; break } catch {} }
  for (const p of candidates.italic) { try { require('fs').accessSync(p); _italicFont = p; break } catch {} }

  _regularFont = _regularFont || 'Helvetica'
  _boldFont = _boldFont || 'Helvetica-Bold'
  _italicFont = _italicFont || 'Helvetica-Oblique'
}

function regularFont(): string { resolveFonts(); return _regularFont! }
function boldFont(): string { resolveFonts(); return _boldFont! }
function italicFont(): string { resolveFonts(); return _italicFont! }

// ---------------------------------------------------------------------------
// HTML → structured blocks parser (exported for DOCX generator)
// ---------------------------------------------------------------------------
export type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'divider' | 'image'

export interface Block {
  type: BlockType
  html: string
  align?: string
}

export interface InlineSegment {
  text: string
  bold: boolean
  italic: boolean
}

function extractAlign(attrs: string): string | undefined {
  const m = /text-align\s*:\s*(left|center|right)/i.exec(attrs)
  return m ? m[1] : undefined
}

export function parseHtml(html: string): Block[] {
  const combined: Block[] = []

  // Normalise line breaks: replace <br> with paragraph break
  let normalized = html.replace(/<br\s*\/?>/gi, '</p><p>')

  // Remove <style> blocks
  normalized = normalized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // Process headings
  for (const level of ['h1', 'h2', 'h3'] as BlockType[]) {
    const regex = new RegExp(`<${level}(\\s[^>]*)?>([\\s\\S]*?)<\\/${level}>`, 'gi')
    let m: RegExpExecArray | null
    while ((m = regex.exec(normalized)) !== null) {
      const align = extractAlign(m[1] || '')
      combined.push({ type: level, html: m[2].trim(), align })
    }
  }

  // Process list items
  const liRe = /<li(\s[^>]*)?>([\s\S]*?)<\/li>/gi
  let m2: RegExpExecArray | null
  while ((m2 = liRe.exec(normalized)) !== null) {
    combined.push({ type: 'li', html: m2[2].trim() })
  }

  // Process paragraphs
  const pRe = /<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi
  let m3: RegExpExecArray | null
  while ((m3 = pRe.exec(normalized)) !== null) {
    const text = m3[2].trim()
    if (text) {
      const align = extractAlign(m3[1] || '')
      combined.push({ type: 'p', html: text, align })
    }
  }

  // Process <hr>
  const hrRe = /<hr\s*\/?>/gi
  while ((m3 = hrRe.exec(normalized)) !== null) {
    combined.push({ type: 'divider', html: '' })
  }

  // Process standalone <img> (logo etc.)
  const imgRe = /<img(\s[^>]*)?\/?>/gi
  while ((m3 = imgRe.exec(normalized)) !== null) {
    combined.push({ type: 'image', html: m3[0] })
  }

  // Fallback: capture any remaining text between tags as paragraphs
  const stripped = normalized.replace(/<[^>]*>/g, '\n').split('\n').map(s => s.trim()).filter(s => s.length > 0)
  for (const text of stripped) {
    // Skip if this text is already covered by a heading or list item
    const alreadyCovered = combined.some(b => b.html === text || b.html.includes(text))
    if (!alreadyCovered) {
      combined.push({ type: 'p', html: text })
    }
  }

  return combined
}

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------
export function parseInline(html: string): InlineSegment[] {
  if (!html) return [{ text: '', bold: false, italic: false }]

  const segments: InlineSegment[] = []
  const regex = /(<\/?(?:strong|b|em|i|u|span|div)[^>]*>)/gi
  const parts = html.split(regex)
  let currentBold = false
  let currentItalic = false

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (['<strong>', '<b>'].includes(lower)) { currentBold = true; continue }
    if (['</strong>', '</b>'].includes(lower)) { currentBold = false; continue }
    if (['<em>', '<i>'].includes(lower)) { currentItalic = true; continue }
    if (['</em>', '</i>'].includes(lower)) { currentItalic = false; continue }
    if (lower.startsWith('<') && lower.endsWith('>')) continue

    const text = part
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .trim()

    if (text) segments.push({ text, bold: currentBold, italic: currentItalic })
  }

  return segments.length > 0 ? segments : [{ text: html.replace(/<[^>]*>/g, '').trim(), bold: false, italic: false }]
}

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------
const PAGE_WIDTH = 595.28  // A4
const PAGE_HEIGHT = 841.89
const MARGIN_LEFT = 50
const MARGIN_RIGHT = 50
const MARGIN_TOP = 55
const MARGIN_BOTTOM = 55
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
const LINE_HEIGHT = 15
const PARA_SPACING = 6
const HEADING_SPACING = 4
const BULLET_INDENT = 14

export async function htmlToPdf(html: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN_LEFT,
        info: { Title: 'Offer Letter', Creator: '247HR' },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      // ---- Draw watermark ----
      drawWatermark(doc)

      // ---- Parse HTML ----
      const blocks = parseHtml(html)

      // ---- Render ----
      let y = MARGIN_TOP

      for (const block of blocks) {
        // Check page overflow
        if (y > PAGE_HEIGHT - MARGIN_BOTTOM - 40) {
          doc.addPage()
          drawWatermark(doc)
          y = MARGIN_TOP
        }

        switch (block.type) {
          case 'h1':
            y = renderHeading(doc, block.html, y, 18, block.align)
            break
          case 'h2':
            y = renderHeading(doc, block.html, y, 14, block.align)
            break
          case 'h3':
            y = renderHeading(doc, block.html, y, 11, block.align)
            break
          case 'p':
            y = renderParagraph(doc, block.html, y, block.align)
            break
          case 'li':
            y = renderListItem(doc, block.html, y)
            break
          case 'divider':
            y = renderDivider(doc, y)
            break
          case 'image':
            y = renderImage(doc, block.html, y)
            break
        }
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------
function drawWatermark(doc: PDFKit.PDFDocument) {
  doc.save()
  doc.font('Helvetica').fontSize(54)
  doc.fillColor('#dddddd')

  const text = 'PRIVATE & CONFIDENTIAL'
  const cx = PAGE_WIDTH / 2
  const cy = PAGE_HEIGHT / 2

  // First watermark (center)
  doc.save()
  doc.translate(cx, cy)
  doc.rotate(-30)
  doc.text(text, -doc.widthOfString(text) / 2, -10)
  doc.restore()

  // Second watermark (upper area)
  doc.save()
  doc.translate(cx, cy * 0.36)
  doc.rotate(-30)
  doc.fontSize(40)
  doc.text(text, -doc.widthOfString(text) / 2 - 30, -10)
  doc.restore()

  doc.fillColor('#000000')
  doc.restore()
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
function renderHeading(doc: PDFKit.PDFDocument, html: string, y: number, fontSize: number, align?: string): number {
  const segments = parseInline(html)
  const text = segments.map(s => s.text).join(' ')
  if (!text) return y

  doc.save()
  const hasBold = segments.some(s => s.bold)
  doc.font(hasBold ? boldFont() : regularFont()).fontSize(fontSize).fillColor('#1e3a5f')

  const textAlign: 'left' | 'center' | 'right' = (align === 'center' || align === 'right') ? align : 'left'
  let x = MARGIN_LEFT
  if (textAlign === 'center') x = PAGE_WIDTH / 2
  else if (textAlign === 'right') x = PAGE_WIDTH - MARGIN_RIGHT

  doc.text(text, x, y, {
    width: textAlign === 'center' ? 0 : CONTENT_WIDTH,
    align: textAlign,
    lineBreak: true,
  })

  doc.restore()
  return y + fontSize * 1.6 + HEADING_SPACING
}

function renderParagraph(doc: PDFKit.PDFDocument, html: string, y: number, align?: string): number {
  const segments = parseInline(html)
  if (!segments.some(s => s.text)) return y

  doc.save()
  const allBold = segments.every(s => s.bold)
  const allItalic = segments.every(s => s.italic)
  let fontName = regularFont()
  if (allBold && allItalic) fontName = boldFont()
  else if (allBold) fontName = boldFont()
  else if (allItalic) fontName = italicFont()

  doc.font(fontName).fontSize(10).fillColor('#1f2937')

  const plainText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ')

  const textAlign: 'left' | 'center' | 'right' = (align === 'center' || align === 'right') ? align : 'left'
  let x = MARGIN_LEFT
  if (textAlign === 'center') x = PAGE_WIDTH / 2
  else if (textAlign === 'right') x = PAGE_WIDTH - MARGIN_RIGHT

  doc.text(plainText, x, y, {
    width: textAlign === 'center' ? 0 : CONTENT_WIDTH,
    align: textAlign,
    lineBreak: true,
  })

  doc.restore()

  // Estimate lines used
  const textW = doc.widthOfString(plainText)
  const lines = Math.max(1, Math.ceil(textW / CONTENT_WIDTH))
  return y + (lines * LINE_HEIGHT) + PARA_SPACING
}

function renderListItem(doc: PDFKit.PDFDocument, html: string, y: number): number {
  const segments = parseInline(html)
  const text = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ')
  if (!text) return y

  doc.save()
  doc.font(regularFont()).fontSize(10).fillColor('#1f2937')

  // Bullet
  doc.text('•', MARGIN_LEFT + 4, y, { lineBreak: false })
  const bulletW = doc.widthOfString('• ')

  // Text after bullet
  doc.text(text, MARGIN_LEFT + bulletW + 8, y, {
    width: CONTENT_WIDTH - bulletW - 12,
    lineBreak: true,
    align: 'left',
  })

  doc.restore()

  const textW = doc.widthOfString(text)
  const lineW = CONTENT_WIDTH - bulletW - 12
  const lines = Math.max(1, Math.ceil(textW / lineW))
  return y + (lines * LINE_HEIGHT) + 2
}

function renderDivider(doc: PDFKit.PDFDocument, y: number): number {
  doc.save()
  doc.strokeColor('#cbd5e1').lineWidth(0.8)
  doc.moveTo(MARGIN_LEFT, y + 6).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y + 6).stroke()
  doc.restore()
  return y + 16
}

function renderImage(doc: PDFKit.PDFDocument, html: string, y: number): number {
  const srcMatch = /src\s*=\s*"([^"]+)"/i.exec(html)
  if (!srcMatch) return y

  const src = srcMatch[1]
  if (!src || src.startsWith('data:')) return y

  try {
    const fs = require('fs')
    if (fs.existsSync(src)) {
      doc.image(src, MARGIN_LEFT, y, { width: 120, height: 40 })
      return y + 50
    }
  } catch {
    // Silently skip images that can't be loaded
  }
  return y
}

// ---------------------------------------------------------------------------
// Exported convenience — shared browser instance removed (no longer needed)
// ---------------------------------------------------------------------------

/**
 * Previously launched a shared headless-Chromium instance via Puppeteer.
 * Now returns `null` since we render via PDFKit directly.
 * Kept as a no-op export so any code that imported `getBrowser()` still compiles.
 */
export async function getBrowser(): Promise<null> {
  return null
}

