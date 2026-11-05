import { prisma } from '@/app/lib/db'

// Shared helper for the standalone Question Bank.
//
// The Prisma `Question` model requires an `assessmentId`, so the reusable
// question library is stored on a per-company sentinel Assessment row
// (name '__QUESTION_BANK__', status DRAFT, no program). The row is created
// on demand.
export const QUESTION_BANK_SENTINEL = '__QUESTION_BANK__'

export async function getOrCreateQuestionBankAssessment(companyId: string) {
  const existing = await prisma.assessment.findFirst({
    where: { companyId, name: QUESTION_BANK_SENTINEL, deletedAt: null },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await prisma.assessment.create({
    data: {
      companyId,
      name: QUESTION_BANK_SENTINEL,
      type: 'Quiz',
      status: 'DRAFT',
      description: 'Internal storage for the reusable question bank. Do not delete.',
      passingScore: 0,
      createdBy: 'system',
    },
    select: { id: true },
  })
  return created.id
}
