// Statuses and errors for the S3 document-storage migration runner (./s3-migration.ts).
// The status columns are plain text in the database (listed in schema-string-status-baseline.txt);
// every write goes through these constants so only known values are stored.
import type { Prisma } from '@prisma/client'

export const S3_JOB_STATUS = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const
export type S3JobStatus = (typeof S3_JOB_STATUS)[keyof typeof S3_JOB_STATUS]

export const S3_SECTION_STATUS = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const
export type S3SectionStatus = (typeof S3_SECTION_STATUS)[keyof typeof S3_SECTION_STATUS]

export type S3MigrationJobWithSections = Prisma.S3MigrationJobGetPayload<{ include: { sections: true } }>

/** A refusal the admin route answers with its own status and message (they are safe to show). */
export class S3MigrationError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message)
    this.name = 'S3MigrationError'
  }
}
