interface RateLimitOptions {
  uniqueTokenPerInterval?: number
  interval?: number
}

export default function rateLimit(options?: RateLimitOptions) {
  const maxTokens = options?.uniqueTokenPerInterval ?? 500
  const intervalMs = options?.interval ?? 60000
  const tokenCache = new Map<string, { count: number; expiresAt: number }>()

  const cleanupExpiredTokens = (now: number) => {
    for (const [key, entry] of tokenCache.entries()) {
      if (entry.expiresAt <= now) {
        tokenCache.delete(key)
      }
    }
  }

  return {
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        const now = Date.now()
        cleanupExpiredTokens(now)

        let tokenEntry = tokenCache.get(token)
        if (!tokenEntry || tokenEntry.expiresAt <= now) {
          tokenEntry = { count: 0, expiresAt: now + intervalMs }
          tokenCache.set(token, tokenEntry)
        }

        tokenEntry.count += 1

        // Keep memory bounded by evicting the oldest key when full.
        if (tokenCache.size > maxTokens) {
          const oldestKey = tokenCache.keys().next().value
          if (oldestKey) {
            tokenCache.delete(oldestKey)
          }
        }

        const currentUsage = tokenEntry.count
        const isRateLimited = currentUsage >= limit

        if (isRateLimited) {
          reject(new Error('Rate limit exceeded'))
        } else {
          resolve()
        }
      })
  }
}