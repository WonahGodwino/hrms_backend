// Batch offer generation (PERF-001): loads every application and grade title
// the batch needs in two queries, instead of two queries per candidate.
import { prisma } from '@/app/lib/db'
import { forCompany } from '@/app/lib/data/tenant'

interface BatchCandidate {
  candidateId: string
  jobId: string
  gradeId?: string | null
}

export async function prefetchBatchOfferData(companyId: string, candidates: BatchCandidate[]) {
  const pairs = candidates.map((c) => ({ candidateId: c.candidateId, jobId: c.jobId }))
  const gradeIds = [...new Set(candidates.map((c) => c.gradeId).filter((id): id is string => Boolean(id)))]

  const [applications, designations] = await Promise.all([
    forCompany(companyId).jobApplication.findMany({
      where: { OR: pairs },
      select: { id: true, candidateId: true, jobId: true, offer: { select: { id: true } } },
    }),
    gradeIds.length
      ? prisma.designation.findMany({ where: { id: { in: gradeIds }, companyId }, select: { id: true, title: true } })
      : Promise.resolve([] as { id: string; title: string }[]),
  ])

  const byPair = new Map<string, { id: string; hasOffer: boolean }>()
  for (const a of applications) {
    const key = `${a.candidateId}|${a.jobId}`
    // Keep the first match, as findFirst did.
    if (!byPair.has(key)) byPair.set(key, { id: a.id, hasOffer: Boolean(a.offer) })
  }
  const titleById = new Map(designations.map((d) => [d.id, d.title]))

  return {
    applicationFor: (candidateId: string, jobId: string) => byPair.get(`${candidateId}|${jobId}`) ?? null,
    gradeTitleFor: (gradeId: string) => titleById.get(gradeId) ?? null,
  }
}
