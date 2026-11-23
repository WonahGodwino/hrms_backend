// Request bodies for /api/admin/s3-migration (API-002).
import { z } from 'zod'

/** DELETE: which migration to cancel. */
export const cancelS3MigrationSchema = z.object({
  jobId: z.string().trim().min(1, 'jobId is required'),
})
