import { LRUCache } from 'lru-cache'

interface RateLimitOptions {
  uniqueTokenPerInterval?: number
  interval?: number
}

export default function rateLimit(options?: RateLimitOptions) {
  const tokenCache = new LRUCache<string, number[]>({
    max: options?.uniqueTokenPerInterval ?? 500,
    ttl: options?.interval ?? 60000
  })

  return {
    check: (limit: number, token: string) =>
      new Promise<void>((resolve, reject) => {
        let tokenCount = tokenCache.get(token)
        if (!tokenCount) {
          tokenCount = [0]
          tokenCache.set(token, tokenCount)
        }

        tokenCount[0] += 1

        const currentUsage = tokenCount[0]
        const isRateLimited = currentUsage >= limit

        if (isRateLimited) {
          reject(new Error('Rate limit exceeded'))
        } else {
          resolve()
        }
      })
  }
}