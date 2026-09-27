// Stateless, signed tokens that let an MD/CEO act on a memo directly from an
// email link WITHOUT logging in. The token is the credential: it embeds the
// memo id and the decision, and is signed with JWT_SECRET so it cannot be
// forged. Single-use in practice — once the decision is applied the memo leaves
// the MD/CEO desk, so a replay of the same token is rejected.

import { sign, verify } from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'hrms_super_secure_jwt_secret_2024_min_32_chars_long!'
const KIND = 'phed-email-action'

export type EmailActionDecision = 'approve' | 'reject'

export function signEmailActionToken(memoId: string, decision: EmailActionDecision): string {
  return sign({ memoId, decision, kind: KIND }, SECRET, { expiresIn: '30d' })
}

export function verifyEmailActionToken(
  token: string,
): { memoId: string; decision: EmailActionDecision } | null {
  try {
    const payload = verify(token, SECRET) as any
    if (!payload || payload.kind !== KIND) return null
    if (typeof payload.memoId !== 'string') return null
    if (payload.decision !== 'approve' && payload.decision !== 'reject') return null
    return { memoId: payload.memoId, decision: payload.decision }
  } catch {
    return null
  }
}
