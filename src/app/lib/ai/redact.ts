// [ai-assistant] Redaction — safety net that scrubs sensitive patterns from AI responses.
// Catches NIN, BVN, bank account numbers, and phone numbers the AI might leak.
// redactForHistory is the stricter filter for the stored copy of a conversation (see the end of this file).

const PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /\b\d{11}\b/g, label: 'NIN/BVN/account' },
  { regex: /\b\d{10}\b/g, label: 'account/phone' },
  { regex: /\b0[7-9][01]\d{8}\b/g, label: 'NG-phone' },
  { regex: /\+234\d{10}\b/g, label: 'NG-phone-intl' },
  { regex: /\b[A-Z]{2}\d{8,11}\b/g, label: 'ID-pattern' },
]

const PLACEHOLDER = '[removed]'

export function redactSensitive(text: string): string {
  let result = text
  for (const { regex } of PATTERNS) {
    result = result.replace(regex, PLACEHOLDER)
  }
  return result
}

export function containsSensitivePatterns(text: string): boolean {
  return PATTERNS.some(({ regex }) => {
    regex.lastIndex = 0
    return regex.test(text)
  })
}

// The stored copy of a conversation also drops values that are fine to show live but must never sit in history (PRD: Chat history
// and retention): email addresses, RSA PINs, salary-style amounts, and long numbers broken up with spaces or dashes.
const HISTORY_PATTERNS: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\bPEN\s?-?\d{12}\b/gi,
  /(?:₦|\bNGN\s?|\bN(?=\d))\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?/g,
  /\b\d{3,4}(?:[ -]\d{3,4}){2,4}\b/g,
]

export function redactForHistory(text: string): string {
  let result = redactSensitive(text)
  for (const regex of HISTORY_PATTERNS) result = result.replace(regex, PLACEHOLDER)
  return result
}