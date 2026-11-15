import { prisma } from '@/app/lib/db'
import { validateCriteria } from './weights'

export interface CreateProfileInput {
  companyId: string
  name: string
  description: string
  criteria: unknown
  defaultAiService?: string | null
  defaultAiModel?: string | null
  defaultStrictness?: string | null
  createdBy: string
}

export interface UpdateProfileInput {
  name?: string
  description?: string
  criteria?: unknown
  defaultAiService?: string | null
  defaultAiModel?: string | null
  defaultStrictness?: string | null
  updatedBy: string
}

export class ProfileValidationError extends Error {}

export async function createScreeningProfile(input: CreateProfileInput) {
  if (!input.name?.trim()) throw new ProfileValidationError('A profile name is required')
  if (!input.description?.trim()) throw new ProfileValidationError('A profile description is required')

  const { error, criteria } = validateCriteria(input.criteria)
  if (error) throw new ProfileValidationError(error)

  return prisma.screeningProfile.create({
    data: {
      companyId: input.companyId,
      name: input.name.trim(),
      description: input.description.trim(),
      criteria: criteria as any,
      defaultAiService: input.defaultAiService || null,
      defaultAiModel: input.defaultAiModel || null,
      defaultStrictness: input.defaultStrictness || null,
      createdBy: input.createdBy,
    },
  })
}

export async function listScreeningProfiles(
  companyId: string,
  status?: string,
  pagination?: { page: number; pageSize: number }
) {
  const where = { companyId, ...(status ? { status } : {}) }
  const [profiles, total] = await Promise.all([
    prisma.screeningProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(pagination ? { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize } : {}),
    }),
    prisma.screeningProfile.count({ where }),
  ])
  return { profiles, total }
}

export async function getScreeningProfile(id: string, companyId: string) {
  return prisma.screeningProfile.findFirst({ where: { id, companyId } })
}

export async function updateScreeningProfile(id: string, companyId: string, input: UpdateProfileInput) {
  const existing = await getScreeningProfile(id, companyId)
  if (!existing) throw new ProfileValidationError('Profile not found')

  let criteria: unknown = existing.criteria
  if (input.criteria !== undefined) {
    const result = validateCriteria(input.criteria)
    if (result.error) throw new ProfileValidationError(result.error)
    criteria = result.criteria
  }

  const name = input.name !== undefined ? input.name.trim() : existing.name
  const description = input.description !== undefined ? input.description.trim() : existing.description
  if (!name) throw new ProfileValidationError('A profile name is required')
  if (!description) throw new ProfileValidationError('A profile description is required')

  return prisma.screeningProfile.update({
    where: { id },
    data: {
      name,
      description,
      criteria: criteria as any,
      defaultAiService: input.defaultAiService !== undefined ? input.defaultAiService : existing.defaultAiService,
      defaultAiModel: input.defaultAiModel !== undefined ? input.defaultAiModel : existing.defaultAiModel,
      defaultStrictness: input.defaultStrictness !== undefined ? input.defaultStrictness : existing.defaultStrictness,
      updatedBy: input.updatedBy,
    },
  })
}

export async function archiveScreeningProfile(id: string, companyId: string, updatedBy: string) {
  const existing = await getScreeningProfile(id, companyId)
  if (!existing) throw new ProfileValidationError('Profile not found')

  return prisma.screeningProfile.update({
    where: { id },
    data: { status: 'ARCHIVED', updatedBy },
  })
}
