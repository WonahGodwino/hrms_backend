// Required documents a candidate uploads AFTER accepting their offer (before HR
// completes their onboarding). Kept as a small, extensible catalog so the set
// can grow without touching the endpoints. `type` maps to the CandidateDocument
// enum column; `category` is the stable key we dedupe/track on.
export interface RequiredDoc {
  category: string   // stable key, stored in candidate_documents.category
  label: string
  type: 'CONTRACT' | 'ID_CARD' | 'CERTIFICATE' | 'OTHER'
  accept: 'pdf' | 'pdf-or-image'
  hint?: string
}

export const CANDIDATE_REQUIRED_DOCS: RequiredDoc[] = [
  { category: 'SIGNED_OFFER', label: 'Signed Offer Letter', type: 'CONTRACT', accept: 'pdf', hint: 'The offer letter you received, signed (PDF).' },
  { category: 'MEANS_OF_ID', label: 'Means of Identification', type: 'ID_CARD', accept: 'pdf-or-image', hint: "Passport, driver's licence, or national ID." },
  { category: 'GUARANTOR_FORM', label: 'Guarantor Form', type: 'OTHER', accept: 'pdf-or-image', hint: 'Completed and signed guarantor form.' },
]

export const REQUIRED_CATEGORIES = CANDIDATE_REQUIRED_DOCS.map((d) => d.category)

export function docFor(category: string): RequiredDoc | undefined {
  return CANDIDATE_REQUIRED_DOCS.find((d) => d.category === category)
}
