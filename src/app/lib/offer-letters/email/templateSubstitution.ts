// src/app/lib/offer-letters/email/templateSubstitution.ts
//
// Plain-text {{variable}} substitution for email subject/body/signature —
// same tag syntax and flat-key convention as the letter's own docx
// variables (backend/src/app/lib/offer-letters/docxTemplate.ts), but this is
// a simple string replace, not a docx render: email text isn't XML, so none
// of that module's run-splitting/nested-object handling applies here.
const TAG_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g

export function substituteEmailVariables(text: string, values: Record<string, unknown>): string {
  return text.replace(TAG_PATTERN, (match, key) => {
    const value = values[key]
    return value === undefined || value === null ? match : String(value)
  })
}
