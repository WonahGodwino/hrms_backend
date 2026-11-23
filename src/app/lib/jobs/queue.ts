// Durable background jobs (REL-001).
//
// pg-boss runs inside the existing long-running backend process (started from
// src/instrumentation.ts) and stores its jobs in Postgres (schema `pgboss`,
// created and migrated by pg-boss itself). It reuses the app's own pg pool, so
// it has the same SSL settings and connection limit as Prisma.
//
// The worker only runs in production (`next start`, NODE_ENV=production) and can
// be switched off with JOB_WORKER=off. In development, or whenever the queue is
// not running, `enqueueJob` returns false and callers run the work inline
// exactly as before, so behaviour never depends on the queue being up.
import PgBoss from 'pg-boss'
import type { Pool } from 'pg'

export const JOB_QUEUES = {
  PAYROLL_UPLOAD: 'payroll-upload',
  PAYSLIP_BULK_SEND: 'payslip-bulk-send',
  CV_SCREENING_RUN: 'cv-screening-run',
  REPORT_EXPORT: 'report-export',
  S3_MIGRATION: 's3-migration',
} as const
export type JobQueueName = (typeof JOB_QUEUES)[keyof typeof JOB_QUEUES]

export type JobHandler = (data: Record<string, unknown>) => Promise<void>

// Jobs are not retried by pg-boss: a retry could start a second copy of work
// that is still running (duplicate payslip emails). Interrupted payroll uploads
// and bulk sends are recovered at startup instead, under an atomic database
// claim (see lib/jobs/handlers.ts). CV screening runs may be retried once,
// because a re-run only processes the CVs still pending.
const QUEUE_SETTINGS: Record<JobQueueName, { retryLimit: number; expireInSeconds: number; concurrency: number }> = {
  [JOB_QUEUES.PAYROLL_UPLOAD]: { retryLimit: 0, expireInSeconds: 6 * 60 * 60, concurrency: 10 },
  [JOB_QUEUES.PAYSLIP_BULK_SEND]: { retryLimit: 0, expireInSeconds: 6 * 60 * 60, concurrency: 10 },
  [JOB_QUEUES.CV_SCREENING_RUN]: { retryLimit: 1, expireInSeconds: 2 * 60 * 60, concurrency: 5 },
  // Report files (PERF-003): at most 2 heavy reports are built at once, whatever the number of requests.
  // One retry: an export interrupted by a restart is built again (it only writes its own file).
  [JOB_QUEUES.REPORT_EXPORT]: { retryLimit: 1, expireInSeconds: 30 * 60, concurrency: 2 },
  // S3 storage migration: one at a time, long-running. Not retried: after a restart the RUNNING
  // migration is handed back to the queue by recoverInterruptedJobs and resumes from where it stopped.
  [JOB_QUEUES.S3_MIGRATION]: { retryLimit: 0, expireInSeconds: 12 * 60 * 60, concurrency: 1 },
}

interface QueueState {
  boss: PgBoss | null
  running: boolean
  starting: Promise<boolean> | null
}
const g = globalThis as unknown as { __hrmsJobQueue?: QueueState }
const state: QueueState = (g.__hrmsJobQueue ??= { boss: null, running: false, starting: null })

/** Whether this process should run the worker at all. */
export function jobWorkerEnabled(): boolean {
  if (process.env.JOB_WORKER === 'off') return false
  return process.env.NODE_ENV === 'production'
}

export function isJobQueueRunning(): boolean {
  return state.running
}

/**
 * Starts pg-boss and the workers. Safe to call more than once. Never throws:
 * on any failure the queue stays off and the app keeps running jobs inline.
 */
export async function startJobQueue(pool: Pool, handlers: Record<JobQueueName, JobHandler>): Promise<boolean> {
  if (state.running) return true
  if (state.starting) return state.starting
  state.starting = (async () => {
    try {
      const boss = new PgBoss({
        db: { executeSql: (text: string, values: unknown[]) => pool.query(text, values) },
        schema: 'pgboss',
      })
      boss.on('error', (err) => console.error('[JOB_QUEUE] pg-boss error:', err))
      await boss.start()

      for (const name of Object.values(JOB_QUEUES)) {
        const s = QUEUE_SETTINGS[name]
        const existing = await boss.getQueue(name)
        if (!existing) {
          await boss.createQueue(name, { name, policy: 'standard', retryLimit: s.retryLimit, expireInSeconds: s.expireInSeconds })
        }
        // N independent single-job workers = up to N jobs of this type at once.
        for (let i = 0; i < s.concurrency; i++) {
          await boss.work(name, { batchSize: 1, pollingIntervalSeconds: 2 }, async (jobs) => {
            for (const job of jobs) await handlers[name]((job.data ?? {}) as Record<string, unknown>)
          })
        }
      }

      state.boss = boss
      state.running = true
      console.log('[JOB_QUEUE] started')
      return true
    } catch (err) {
      console.error('[JOB_QUEUE] could not start; background work will run inline as before:', err)
      state.running = false
      return false
    } finally {
      state.starting = null
    }
  })()
  return state.starting
}

/**
 * Queues a job. Returns true when queued, false when the queue is not running
 * or the send failed, in which case the caller must run the work inline.
 */
export async function enqueueJob(name: JobQueueName, data: Record<string, unknown>): Promise<boolean> {
  if (!state.running || !state.boss) return false
  const s = QUEUE_SETTINGS[name]
  try {
    const id = await state.boss.send(name, data, { retryLimit: s.retryLimit, expireInSeconds: s.expireInSeconds })
    return Boolean(id)
  } catch (err) {
    console.error(`[JOB_QUEUE] enqueue to ${name} failed; running inline instead:`, err)
    return false
  }
}
