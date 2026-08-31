// app/lib/jobs/get-jobs.ts
import { prisma } from '@/app/lib/db';
import { UserContext, JobWithRelations } from './types';

/**
 * Get jobs with role-based filtering
 */
export async function getJobs(
  user: UserContext,
  companyId: string,
  filters: any = {}
): Promise<Partial<JobWithRelations>[]> {
  const baseWhere: any = {
    companyId,
    ...filters
  };

  // Apply role-based archived filtering
  if (user.role !== 'SUPER_ADMIN') {
    baseWhere.archived = 0;
  }

  const includeFields: any = {
    keywords: true,
    company: { select: { id: true, companyName: true } }
  };

  if (user.role === 'SUPER_ADMIN') {
    includeFields.applications = {
      include: {
        interviews: true,
        offer: {
          include: {
            onboarding: {
              include: {
                tasks: true,
                documents: true
              }
            }
          }
        },
        files: true,
        stageHistory: true,
        candidate: true
      }
    };
  } else {
    includeFields.applications = {
      where: { archived: 0 },
      include: {
        interviews: { where: { archived: 0 } },
        offer: {
          where: { archived: 0 },
          include: {
            onboarding: {
              where: { archived: 0 },
              include: {
                tasks: { where: { archived: 0 } },
                documents: { where: { archived: 0 } }
              }
            }
          }
        },
        files: { where: { archived: 0 } },
        stageHistory: { where: { archived: 0 } },
        candidate: true
      }
    };
  }

  const jobs = await prisma.job.findMany({
    where: baseWhere,
    include: includeFields,
    orderBy: { createdAt: 'desc' }
  });

  return jobs;
}