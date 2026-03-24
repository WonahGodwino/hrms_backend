declare module 'lru-cache' {
  class LRUCache<K = any, V = any> {
    constructor(options?: any)
    get(key: K): V | undefined
    set(key: K, value: V, options?: any): this
    has(key: K): boolean
    delete(key: K): boolean
    clear(): void
    readonly size: number
  }

  export { LRUCache }
  export default LRUCache
}