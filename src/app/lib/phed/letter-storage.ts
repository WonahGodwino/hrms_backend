// ============================================================
// Letter file storage — local filesystem under public/phed/letters.
// Namespaced by company and run. 30-day retention is driven by
// PhedLetterRun.filesExpireAt (a scheduled cleanup deletes expired files).
// ============================================================

import fs from 'fs'
import path from 'path'

const BASE = path.join(process.cwd(), 'public', 'phed', 'letters')

export function runDir(companyId: string, runId: string): string {
  return path.join(BASE, companyId, runId)
}

/** Write a file for a run and return its storage key (relative POSIX path). */
export function writeRunFile(companyId: string, runId: string, fileName: string, data: Buffer): string {
  const dir = runDir(companyId, runId)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, fileName), data)
  return `${companyId}/${runId}/${fileName}`
}

export function readRunFile(storageKey: string): Buffer {
  return fs.readFileSync(path.join(BASE, storageKey))
}

export function deleteRunFiles(companyId: string, runId: string): void {
  fs.rmSync(runDir(companyId, runId), { recursive: true, force: true })
}

/** Safe file name for a letter PDF (FR-12). */
export function letterFileName(employeeId: string, name: string): string {
  const clean = (s: string) =>
    s.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'staff'
  return `${clean(employeeId)}_${clean(name)}_Salary_Increase.pdf`
}
