// src/app/lib/fileParser.ts

import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

export async function parsePdf(fileBuffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(fileBuffer)
    return data.text // Extracted text from PDF
  } catch (error) {
    throw new Error('Failed to parse PDF file: ' + error.message)
  }
}

export async function parseDocx(fileBuffer: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: fileBuffer })
    return value // Extracted text from DOCX
  } catch (error) {
    throw new Error('Failed to parse DOCX file: ' + error.message)
  }
}
