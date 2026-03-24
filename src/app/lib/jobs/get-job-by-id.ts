// app/lib/jobs/get-job-by-id.ts
import { prisma } from '@/app/lib/db';
import { UserContext, JobWithRelations } from './types';

/**
 * Get single job by ID with role-based filtering
 */
export async function getJobById(
  user: UserContext,
  jobId: string
): Promise<JobWithRelations | null> {
  const baseWhere: any = {
    id: jobId
  };

  // Check company access for non-SUPER_ADMIN
  if (user.role !== 'SUPER_ADMIN') {
    baseWhere.archived = 0;
    
    // Verify company access
    const job = await prisma.job.findFirst({
      where: { id: jobId },
      select: { companyId: true }
    });
    
    if (job && job.companyId !== user.companyId) {
      throw new Error('Access denied to this job');
    }
  }

  const includeFields: any = {
    keywords: true,
    company: true
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

  const job = await prisma.job.findFirst({
    where: baseWhere,
    include: includeFields
  });

  return job as JobWithRelations | null;
}