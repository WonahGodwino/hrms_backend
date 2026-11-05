// [ai-assistant] AES-256-GCM key vault — encrypts provider API keys at rest.
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

// True when the server can encrypt provider keys. Checked before a key is tested, so a missing secret is
// reported plainly instead of surfacing as a generic server error after the provider call.
export function isVaultConfigured(): boolean {
  const raw = process.env.AI_PROVIDER_KEY_SECRET
  return !!raw && raw.length >= 32
}

function getSecret(): Buffer {
  const raw = process.env.AI_PROVIDER_KEY_SECRET
  if (!raw || raw.length < 32) {
    throw new Error('AI_PROVIDER_KEY_SECRET must be set (at least 32 characters)')
  }
  return Buffer.from(raw.slice(0, 32), 'utf8')
}

export function encryptKey(plain: string): { encrypted: string; last4: string } {
  const secret = getSecret()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, secret, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, tag, encrypted])
  return {
    encrypted: combined.toString('base64'),
    last4: plain.slice(-4),
  }
}

export function decryptKey(encoded: string): string {
  const secret = getSecret()
  const combined = Buffer.from(encoded, 'base64')
  const iv = combined.subarray(0, IV_LENGTH)
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const data = combined.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, secret, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}
