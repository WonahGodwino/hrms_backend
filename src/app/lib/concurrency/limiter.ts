// A small concurrency limiter (PERF-003): at most `max` tasks run at once,
// the rest wait in arrival order. Used to keep CPU/memory-heavy work such as
// headless-Chrome PDF rendering from piling up inside one web process.

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>

export function createLimiter(max: number): Limiter {
  const limit = Math.max(1, Math.floor(max) || 1)
  let active = 0
  const queue: Array<() => void> = []

  const next = () => {
    if (active >= limit) return
    const start = queue.shift()
    if (start) {
      active++
      start()
    }
  }

  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--
            next()
          })
      })
      next()
    })
}

/** Positive integer from an environment variable, or the fallback. */
export function envConcurrency(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isInteger(n) && n > 0 ? n : fallback
}
