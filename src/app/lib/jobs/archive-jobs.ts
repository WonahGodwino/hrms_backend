// app/lib/jobs/archive-jobs.ts
import { prisma } from '@/app/lib/db';
import { UserContext, ArchiveResult } from './types';

/**
 * Archive jobs (soft delete) with all related records
 * For non-SUPER_ADMIN users, this appears as permanent deletion
 */
export async function archiveJobs(
  user: UserContext,
  jobIds: string[]
): Promise<ArchiveResult> {
  // Find jobs that are not already archived
  const existingJobs = await prisma.job.findMany({
    where: {
      id: { in: jobIds },
      company: { archived: 0 },
      archived: 0,
    },
    select: {
      id: true,
      title: true,
      companyId: true,
      applications: {
        where: { archived: 0 },
        select: {
          id: true,
          interviews: { where: { archived: 0 }, select: { id: true } },
          offer: {
            where: { archived: 0 },
            select: { 
              id: true, 
              onboarding: {
                where: { archived: 0 },
                select: { 
                  id: true,
                  tasks: { where: { archived: 0 }, select: { id: true } },
                  documents: { where: { archived: 0 }, select: { id: true } }
                }
              }
            }
          },
          files: { where: { archived: 0 }, select: { id: true } },
          stageHistory: { where: { archived: 0 }, select: { id: true } }
        }
      },
      keywords: { where: { archived: 0 }, select: { id: true } }
    }
  });

  if (existingJobs.length === 0) {
    throw new Error('No active jobs were found for archiving');
  }

  // Check permissions for non-SUPER_ADMIN
  if (user.role !== 'SUPER_ADMIN') {
    const uniqueCompanyIds = [...new Set(existingJobs.map(job => job.companyId))];
    for (const companyId of uniqueCompanyIds) {
      if (companyId !== user.companyId) {
        throw new Error('You do not have permission to archive jobs from other companies');
      }
    }
  }

  const archiveTime = new Date();

  // Perform archive transaction
  await prisma.$transaction(async (tx) => {
    for (const job of existingJobs) {
      const applicationIds = job.applications.map(app => app.id);
      
      if (applicationIds.length > 0) {
        // Archive stage history
        await tx.applicationStageHistory.updateMany({
          where: { applicationId: { in: applicationIds } },
          data: { archived: 1, updatedAt: archiveTime }
        });

        // Archive interviews
        await tx.interview.updateMany({
          where: { applicationId: { in: applicationIds } },
          data: { archived: 1, updatedAt: archiveTime }
        });

        // Handle offers
        const offers = job.applications
          .filter(app => app.offer)
          .map(app => app.offer);

        for (const offer of offers) {
          if (offer?.onboarding) {
            // Archive onboarding tasks
            await tx.onboardingTask.updateMany({
              where: { onboardingId: offer.onboarding.id },
              data: { archived: 1, updatedAt: archiveTime }
            });

            // Archive onboarding documents
            await tx.candidateDocument.updateMany({
              where: { onboardingId: offer.onboarding.id },
              data: { archived: 1, updatedAt: archiveTime }
            });

            // Archive onboarding
            await tx.onboarding.update({
              where: { id: offer.onboarding.id },
              data: { archived: 1, updatedAt: archiveTime }
            });
          }
        }

        // Archive offers
        const offerIds = offers
          .map((o) => o?.id)
          .filter((id): id is string => Boolean(id));
        if (offerIds.length > 0) {
          await tx.offer.updateMany({
            where: { id: { in: offerIds } },
            data: { archived: 1, updatedAt: archiveTime }
          });
        }

        // Archive candidate files
        await tx.candidateFile.updateMany({
          where: { applicationId: { in: applicationIds } },
          data: { archived: 1, updatedAt: archiveTime }
        });

        // Archive applications
        await tx.jobApplication.updateMany({
          where: { id: { in: applicationIds } },
          data: { archived: 1, updatedAt: archiveTime, updatedBy: user.userId }
        });
      }

      // Archive keywords
      if (job.keywords.length > 0) {
        await tx.keyword.updateMany({
          where: { id: { in: job.keywords.map(k => k.id) } },
          data: { archived: 1, updatedAt: archiveTime }
        });
      }
    }

    // Archive jobs
    await tx.job.updateMany({
      where: { id: { in: existingJobs.map(job => job.id) } },
      data: {
        archived: 1,
        updatedBy: user.userId,
        updatedAt: archiveTime,
        status: 'CLOSED',
      }
    });
  });

  // Prepare response based on role
  if (user.role === 'SUPER_ADMIN') {
    return {
      archivedCount: existingJobs.length,
      archivedIds: existingJobs.map(job => job.id),
      archivedJobTitles: existingJobs.map(job => job.title),
      archivedAt: archiveTime.toISOString(),
      statistics: {
        totalApplications: existingJobs.reduce((acc, job) => acc + job.applications.length, 0),
        totalKeywords: existingJobs.reduce((acc, job) => acc + job.keywords.length, 0)
      }
    };
  }

  return {
    deletedCount: existingJobs.length,
    deletedIds: existingJobs.map(job => job.id),
    archivedAt: archiveTime.toISOString()
  };
}