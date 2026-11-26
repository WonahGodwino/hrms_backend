// Documents a staff member uploads about themselves ("My Documents", api/staff/onboarding-documents).
// Stored one file per category in StaffOnboardingDocument (category is plain text, so adding one needs no migration).

export const STAFF_DOCUMENT_CATEGORIES = ['MEANS_OF_ID', 'GUARANTOR_FORM', 'SIGNED_OFFER', 'BIRTH_CERTIFICATE'] as const
export type StaffDocumentCategory = (typeof STAFF_DOCUMENT_CATEGORIES)[number]

export const STAFF_DOCUMENT_LABELS: Record<StaffDocumentCategory, string> = {
  MEANS_OF_ID: 'Means of Identification',
  GUARANTOR_FORM: 'Guarantor Form',
  SIGNED_OFFER: 'Signed Offer Letter',
  BIRTH_CERTIFICATE: 'Birth Certificate',
}

export function isStaffDocumentCategory(value: string): value is StaffDocumentCategory {
  return (STAFF_DOCUMENT_CATEGORIES as readonly string[]).includes(value)
}

export interface StaffDocumentRow {
  id: string
  category: string
  fileName: string
  sizeBytes: number | null
  updatedAt: Date
}

/** Which documents a staff member has uploaded, and how complete the set is. */
export function buildStaffDocumentProgress(docs: StaffDocumentRow[]) {
  const items = STAFF_DOCUMENT_CATEGORIES.map((category) => {
    const doc = docs.find((d) => d.category === category)
    return {
      category,
      label: STAFF_DOCUMENT_LABELS[category],
      uploaded: !!doc,
      documentId: doc?.id || null,
      fileName: doc?.fileName || null,
      sizeBytes: doc?.sizeBytes || null,
      uploadedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null,
    }
  })
  const uploaded = items.filter((i) => i.uploaded).length
  const required = STAFF_DOCUMENT_CATEGORIES.length
  return { items, uploaded, required, percent: Math.round((uploaded / required) * 100), complete: uploaded === required }
}
