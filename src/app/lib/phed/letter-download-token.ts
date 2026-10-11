// Stateless, signed download links for letter-run ZIPs. A link is issued by an
// authorised operator via POST /letter-runs/:id/download-link and is valid for
// 15 minutes. The token embeds the run id and company id, and is signed with
// JWT_SECRET so it cannot be forged; the download route verifies both.

import { sign, verify } from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'hrms_super_secure_jwt_secret_2024_min_32_chars_long!'
const KIND = 'phed-letter-download'
const EXPIRES_IN_SECONDS = 15 * 60

export function signLetterDownloadToken(runId: string, companyId: string): { token: string; expiresIn: number } {
  const token = sign({ runId, companyId, kind: KIND }, SECRET, { expiresIn: EXPIRES_IN_SECONDS })
  return { token, expiresIn: EXPIRES_IN_SECONDS }
}

export function verifyLetterDownloadToken(
  token: string,
): { runId: string; companyId: string } | null {
  try {
    const payload = verify(token, SECRET) as any
    if (!payload || payload.kind !== KIND) return null
    if (typeof payload.runId !== 'string' || typeof payload.companyId !== 'string') return null
    return { runId: payload.runId, companyId: payload.companyId }
  } catch {
    return null
  }
}
