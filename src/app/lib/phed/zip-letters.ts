// ============================================================
// ZIP packaging for letter runs (archiver, streaming).
// ============================================================

import archiver from 'archiver'

export interface ZipEntry {
  name: string
  data: Buffer
}

export function createZip(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks: Buffer[] = []
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    for (const entry of entries) {
      archive.append(entry.data, { name: entry.name })
    }
    archive.finalize()
  })
}
