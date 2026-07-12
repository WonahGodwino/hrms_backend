// src/app/lib/offers/offer-letter-pdf.ts
// Renders print-ready HTML to a PDF Buffer via headless Chromium (puppeteer).
// Launch args include the container-safe sandbox flags used across the codebase.
import puppeteer from 'puppeteer'

let browserPromise: Promise<any> | null = null

// Reuse a single browser instance across requests (cold start is expensive).
// Exported so other renderers (e.g. the DOCX exporter) can share the instance.
export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }).catch((e: unknown) => { browserPromise = null; throw e })
  }
  return browserPromise
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await page.close().catch(() => {})
  }
}
