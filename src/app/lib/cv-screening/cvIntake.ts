// Thin wrapper around the reused, module-agnostic CV text extractor
// (recruitment/cvText.ts), adding this module's own file-type/size validation
// for standalone batch uploads (recruitment's single-file apply route has its
// own, separately-tuned limits we don't want to couple to).
import { fileTypeFromBuffer } from 'file-type'
import { extractCvText } from '@/app/lib/recruitment/cvText'

export const MAX_CV_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB per file
export const MAX_FILES_PER_RUN = 200 // hard cap, guards against runaway AI cost/time

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx']

export interface CvFileValidationResult {
  valid: boolean
  error?: string
  mimeType?: string
}

export async function validateCvFile(buffer: Buffer, fileName: string, sizeBytes: number): Promise<CvFileValidationResult> {
  if (sizeBytes > MAX_CV_FILE_SIZE_BYTES) {
    return { valid: false, error: `"${fileName}" exceeds the 5MB file size limit` }
  }

  const detected = await fileTypeFromBuffer(buffer)
  const extension = fileName.split('.').pop()?.toLowerCase()

  const isValidMimeType = detected && ALLOWED_MIME_TYPES.includes(detected.mime)
  const isValidExtension = extension && ALLOWED_EXTENSIONS.includes(extension)

  if (!isValidMimeType && !isValidExtension) {
    return { valid: false, error: `"${fileName}" is not a supported file type. Allowed formats: .pdf, .doc, .docx` }
  }

  return { valid: true, mimeType: detected?.mime || 'application/octet-stream' }
}

export async function extractCandidateCvText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  return extractCvText(buffer, mimeType, fileName)
}
