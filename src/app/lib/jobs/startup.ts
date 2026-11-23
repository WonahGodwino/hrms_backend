// Starts the durable job queue at server start (REL-001). Called from
// src/instrumentation.ts in the Node.js runtime only. Production only; see
// ./queue.ts. Runs in the background so it never delays the server becoming
// ready, and any failure leaves jobs running inline as before.
import type { Pool } from 'pg'
import { jobWorkerEnabled, startJobQueue } from './queue'

export function startJobsOnBoot(): void {
  if (!jobWorkerEnabled()) return

  const start = async () => {
    // Importing the client creates the shared pg pool the queue reuses.
    await import('@/app/lib/db')
    const pool = (globalThis as unknown as { pgPool?: Pool }).pgPool
    if (!pool) {
      console.error('[JOB_QUEUE] database pool not available; background work will run inline as before')
      return
    }
    const { JOB_HANDLERS, recoverInterruptedJobs } = await import('./handlers')
    if (await startJobQueue(pool, JOB_HANDLERS)) {
      await recoverInterruptedJobs()
    }
  }
  start().catch((err) => console.error('[JOB_QUEUE] startup failed; background work will run inline as before:', err))
}
