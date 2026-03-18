// app/lib/jobs/restore-job.ts
import { prisma } from '@/app/lib/db';
import { UserContext } from './types';

/**
 * Restore archived job (SUPER_ADMIN only)
 */
export async function restoreJob(
  user: UserContext,
  jobId: string
) {
  if (user.role !== 'SUPER_ADMIN') {
    throw new Error('Only SUPER_ADMIN can restore archived jobs');
  }

  return await prisma.$transaction(async (tx) => {
    // Find the archived job with all its related archived records
    const job = await tx.job.findUnique({
      where: { id: jobId },
      include: {
        applications: {
          where: { archived: 1 },
          include: {
            interviews: { where: { archived: 1 } },
            offer: {
              where: { archived: 1 },
              include: {
                onboarding: {
                  where: { archived: 1 },
                  include: {
                    tasks: { where: { archived: 1 } },
                    documents: { where: { archived: 1 } }
                  }
                }
              }
            },
            files: { where: { archived: 1 } },
            stageHistory: { where: { archived: 1 } }
          }
        },
        keywords: { where: { archived: 1 } }
      }
    });

    if (!job) {
      throw new Error('Archived job not found');
    }

    const restoreTime = new Date();

    // Restore in reverse order
    for (const app of job.applications) {
      // Restore stage history
      if (app.stageHistory.length > 0) {
        await tx.applicationStageHistory.updateMany({
          where: { id: { in: app.stageHistory.map(h => h.id) } },
          data: { archived: 0, updatedAt: restoreTime }
        });
      }

      // Restore interviews
      if (app.interviews.length > 0) {
        await tx.interview.updateMany({
          where: { id: { in: app.interviews.map(i => i.id) } },
          data: { archived: 0, updatedAt: restoreTime }
        });
      }

      // Restore files
      if (app.files.length > 0) {
        await tx.candidateFile.updateMany({
          where: { id: { in: app.files.map(f => f.id) } },
          data: { archived: 0, updatedAt: restoreTime }
        });
      }

      // Restore offer and related
      if (app.offer) {
        if (app.offer.onboarding) {
          // Restore onboarding tasks
          if (app.offer.onboarding.tasks.length > 0) {
            await tx.onboardingTask.updateMany({
              where: { id: { in: app.offer.onboarding.tasks.map(t => t.id) } },
              data: { archived: 0, updatedAt: restoreTime }
            });
          }

          // Restore onboarding documents
          if (app.offer.onboarding.documents.length > 0) {
            await tx.candidateDocument.updateMany({
              where: { id: { in: app.offer.onboarding.documents.map(d => d.id) } },
              data: { archived: 0, updatedAt: restoreTime }
            });
          }

          // Restore onboarding
          await tx.onboarding.update({
            where: { id: app.offer.onboarding.id },
            data: { archived: 0, updatedAt: restoreTime }
          });
        }

        // Restore offer
        await tx.offer.update({
          where: { id: app.offer.id },
          data: { archived: 0, updatedAt: restoreTime }
        });
      }

      // Restore application
      await tx.jobApplication.update({
        where: { id: app.id },
        data: { archived: 0, updatedAt: restoreTime }
      });
    }

    // Restore keywords
    if (job.keywords.length > 0) {
      await tx.keyword.updateMany({
        where: { id: { in: job.keywords.map(k => k.id) } },
        data: { archived: 0, updatedAt: restoreTime }
      });
    }

    // Restore job
    const restoredJob = await tx.job.update({
      where: { id: jobId },
      data: {
        archived: 0,
        status: 'ACTIVE',
        updatedBy: user.userId,
        updatedAt: restoreTime
      }
    });

    return restoredJob;
  });
}