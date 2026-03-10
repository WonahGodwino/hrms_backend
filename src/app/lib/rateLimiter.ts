// ...existing code...
import * as LRU from 'lru-cache'

interface LRUCacheInstance<K = any, V = any> {
  get(key: K): V | undefined
  set(key: K, value: V, options?: any): LRUCacheInstance<K, V>
  has(key: K): boolean
  delete(key: K): boolean
  clear(): void
  readonly size: number
}

interface LRUCacheConstructor {
  new <K = any, V = any>(options?: any): LRUCacheInstance<K, V>
}

// runtime-compatible constructor resolution for different lru-cache exports
const LRUCache = ((LRU as any).default ?? (LRU as any).LRUCache ?? LRU) as unknown as LRUCacheConstructor

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
// ...existing code...