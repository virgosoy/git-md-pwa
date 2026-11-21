import { vi } from 'vitest'

export interface FakeCacheEntry {
  url: string
  body: Uint8Array
  headers?: Record<string, string>
}

/**
 * 内存 Cache Storage 桩：只覆盖存储统计用到的 keys/open/entries/match。
 * jsdom 不实现 CacheStorage，统计测试与组件测试共用这一最小桩。
 */
export function installFakeCaches(entries: FakeCacheEntry[]): void {
  const cache = {
    keys: async () => entries.map((e) => ({ url: e.url }) as Request),
    match: async (req: Request) => {
      const e = entries.find((x) => x.url === req.url)
      return e ? new Response(e.body.slice().buffer, { headers: e.headers }) : undefined
    }
  }
  vi.stubGlobal('caches', {
    keys: async () => ['precache'],
    open: async () => cache
  })
}
