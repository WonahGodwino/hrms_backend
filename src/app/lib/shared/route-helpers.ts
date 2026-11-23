// Helpers shared by several routes (ARCH-002 / CODE-005: identical copies merged).

export function normalizeHeader(h: string): string {
  return h
    .toString()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
