// src/app/lib/payroll/concurrency.ts
//
// Tiny bounded-concurrency helpers for the payroll/email pipelines. Kept
// dependency-free (no p-limit) so it can be used from any route or lib.

/**
 * Run `worker` over `items` with at most `limit` in flight at once. Items are
 * started in order; one worker throwing does not stop the others (the error is
 * captured per item). Resolves when every item has settled.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(items.length)
  let next = 0
  const lanes = Math.max(1, Math.min(limit, items.length))

  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (true) {
        const index = next++
        if (index >= items.length) return
        try {
          results[index] = { ok: true, value: await worker(items[index], index) }
        } catch (error) {
          results[index] = { ok: false, error }
        }
      }
    })
  )

  return results
}

/**
 * Simple global rate limiter: `acquire()` resolves so that no more than
 * `perSecond` calls are released per second across all callers. Protects the
 * mail provider's sender reputation during large sends.
 */
export function createRateLimiter(perSecond: number) {
  const interval = 1000 / Math.max(1, perSecond)
  let nextSlot = 0
  return async function acquire(): Promise<void> {
    const now = Date.now()
    const slot = Math.max(now, nextSlot)
    nextSlot = slot + interval
    const wait = slot - now
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  }
}
