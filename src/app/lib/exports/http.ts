// HTTP helpers for background-prepared files (PERF-003).

/** `attachment` Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
