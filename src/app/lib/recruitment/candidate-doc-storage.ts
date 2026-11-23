// Candidate onboarding documents and executed contracts (SEC-003).
// Thin wrapper over the shared private storage in lib/storage/private-files.ts.
import { PDF_ONLY, PDF_OR_IMAGE, detectFileType, readPrivateFile, savePrivateFile } from '@/app/lib/storage/private-files'

export type CandidateDocKind = 'pdf' | 'pdf-or-image'

/**
 * Checks the real file type from its bytes (not the client-supplied name or
 * MIME type). Returns the extension to store with, or null when not allowed.
 */
export async function detectAllowedType(buffer: Buffer, kind: CandidateDocKind): Promise<{ ext: string; mime: string } | null> {
  return detectFileType(buffer, kind === 'pdf' ? PDF_ONLY : PDF_OR_IMAGE)
}

/** Writes a file privately and returns the relative path to store in the database. */
export const saveCandidateDoc = savePrivateFile

/** Reads a stored document: private location first, then the legacy public location. */
export const readCandidateDoc = readPrivateFile
