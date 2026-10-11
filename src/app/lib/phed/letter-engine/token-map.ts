// ============================================================
// Token map for the salary-increase letter (pure).
// The 13 tokens and their canonical template (§5.1).
// ============================================================

export const LETTER_TOKENS = [
  'letter_date',
  'staff_name',
  'staff_id',
  'first_name',
  'approval_period',
  'previous_gross',
  'previous_gross_words',
  'current_gross',
  'current_gross_words',
  'effective_date',
  'performance_year',
  'signatory_name',
  'signatory_title',
] as const

export type LetterToken = (typeof LETTER_TOKENS)[number]

export const DEFAULT_LETTER_TYPE = 'SALARY_INCREASE'

// The body (title through signatory). The letterhead, date, staff name and
// staff id are rendered by the PDF layout, not merged into the body text.
export const CANONICAL_LETTER_BODY = [
  'SALARY INCREASE',
  '',
  'Dear {{first_name}},',
  '',
  'In line with our Play to Win by Doing Right, Management has approved a salary increase for you in {{approval_period}}.',
  '',
  'Consequently, your annual remuneration has been reviewed from {{previous_gross}} ({{previous_gross_words}}) to {{current_gross}} ({{current_gross_words}}) effective {{effective_date}} and subject to applicable taxes and deductions in accordance with company policies.',
  '',
  'Management will continue to count on you to deliver value both to the Organization and its esteemed customers, while thanking you for a good performance for {{performance_year}}.',
  '',
  'Please note that this letter supersedes any previously issued compensation agreement with PHED.',
  '',
  'Yours faithfully,',
  'For: Port Harcourt Electricity Distribution Plc (PHED)',
  '',
  '{{signatory_name}}',
  '{{signatory_title}}',
].join('\n')

export const CANONICAL_LETTERHEAD = [
  'C/O PHED Plc.',
  'No.1 Moscow Road.',
  'Port Harcourt, Rivers.',
  '',
  'Personal and Confidential',
].join('\n')

/** Regex to find every {{token}} in a template body. */
export const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g

/** Extract the distinct token names used by a template body, in order. */
export function extractTokens(body: string): string[] {
  const found: string[] = []
  for (const match of body.matchAll(TOKEN_PATTERN)) {
    const name = match[1]
    if (!found.includes(name)) found.push(name)
  }
  return found
}

/** True when every token in `body` is a known token (reject unknown at save). */
export function validateTemplateTokens(body: string): { ok: boolean; unknown: string[] } {
  const unknown = extractTokens(body).filter((t) => !(LETTER_TOKENS as readonly string[]).includes(t))
  return { ok: unknown.length === 0, unknown }
}
