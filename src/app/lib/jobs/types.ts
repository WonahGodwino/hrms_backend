// app/lib/jobs/types.ts
import { Job, Prisma } from '@prisma/client';

export interface UserContext {
  userId: string;
  role: 'HR' | 'ADMIN' | 'SUPER_ADMIN';
  companyId?: string;
}

export interface ArchiveResult {
  // For SUPER_ADMIN
  archivedCount?: number;
  archivedIds?: string[];
  archivedJobTitles?: string[];
  statistics?: {
    totalApplications: number;
    totalKeywords: number;
  };
  // For regular users
  deletedCount?: number;
  deletedIds?: string[];
  // Common fields
  archivedAt: string;
}

export type JobWithRelations = Prisma.JobGetPayload<{
  include: {
    keywords: true;
    company: { select: { id: true; companyName: true } };
    applications: {
      include: {
        interviews: true;
        offer: {
          include: {
            onboarding: {
              include: {
                tasks: true;
                documents: true;
              };
            };
          };
        };
        files: true;
        stageHistory: true;
        candidate: true;
      };
    };
  };
}>;