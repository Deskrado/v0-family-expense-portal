import { mutate } from "swr"

function matchesKey(key: unknown, target: string) {
  return key === target || (Array.isArray(key) && key[0] === target)
}

/** Revalidates every SWR cache entry whose key (or key[0] for array keys) equals `key`. */
export function invalidateCache(key: string) {
  return mutate((cacheKey) => matchesKey(cacheKey, key))
}

/** Revalidates every SWR cache entry whose key (or key[0] for array keys) equals any of `keys`. */
export function invalidateCaches(keys: string[]) {
  return mutate((cacheKey) => keys.some((key) => matchesKey(cacheKey, key)))
}

/** Revalidates every SWR cache entry whose key (or key[0] for array keys) starts with `prefix`. */
export function invalidateCacheByPrefix(prefix: string) {
  return mutate((cacheKey) => {
    const keyName = Array.isArray(cacheKey) ? cacheKey[0] : cacheKey
    return typeof keyName === "string" && keyName.startsWith(prefix)
  })
}
