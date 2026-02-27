// src/app/lib/rateLimiter.ts
import { LRUCache } from 'lru-cache'

interface RateLimitOptions {
  uniqueTokenPerInterval?: number
  interval?: number
}

export default function rateLimit(options?: RateLimitOptions) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options?.uniqueTokenPerInterval || 500,
    ttl: options?.interval || 60000, // v11 uses ttl instead of maxAge
  })

  return {
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        const tokenCount = tokenCache.get(token)
        
        if (!tokenCount) {
          tokenCache.set(token, [1])
          resolve()
          return
        }

        tokenCount[0] += 1
        const currentUsage = tokenCount[0]
        
        if (currentUsage >= limit) {
          reject(new Error('Rate limit exceeded'))
        } else {
          resolve()
        }
      }),
  }
}