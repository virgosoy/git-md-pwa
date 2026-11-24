// U5 · 已安装构建判定：对比 SW 预缓存里的首页与当前页面正在跑的脚本。
// 只读本机 Cache Storage（不发网络请求）；读不到就返回 unknown，绝不让调用方误判。
// 等新 SW 接管时，同一预缓存里会同时存在旧/新两份 index.html 修订，
// 所以要把所有副本都看一遍：任一份与当前页面不同，就说明「新构建已装好」。

import { withTimeout } from '../lib/async'

/** same=预缓存里就是当前构建；different=预缓存里是另一份构建；unknown=读不到，无法判定 */
export type InstalledBuild = 'same' | 'different' | 'unknown'

export interface InstalledBuildDeps {
  /** 当前页面是否受 Service Worker 控制 */
  controllerPresent?: () => boolean
  /** 当前页面在跑的脚本绝对 URL；拿不到 → null */
  runningScriptSrc?: () => string | null
  /** 预缓存里所有 index.html 副本引用的脚本（绝对 URL）；测试注入 */
  precachedIndexScripts?: () => Promise<string[]>
  /** 整个判定的上限 */
  timeoutMs?: number
}

/** 预缓存读取上限：Cache Storage 是本地操作，正常毫秒级；只防异常悬挂 */
const DETECT_TIMEOUT_MS = 2_000

function defaultControllerPresent(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller
}

function defaultRunningScriptSrc(): string | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector('script[src]')
  return el instanceof HTMLScriptElement ? el.src : null
}

/** 从一段首页 HTML 里取模块脚本的绝对 URL */
function firstScriptSrc(html: string, baseUrl: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const src = doc.querySelector('script[src]')?.getAttribute('src')
    return src ? new URL(src, baseUrl).href : null
  } catch {
    return null
  }
}

/** 读本机所有 Workbox 预缓存副本里的首页脚本 */
async function defaultPrecachedIndexScripts(): Promise<string[]> {
  if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return []
  if (typeof document === 'undefined') return []
  const indexUrl = new URL('index.html', document.baseURI)
  const scripts: string[] = []
  for (const name of await caches.keys()) {
    if (!name.includes('precache')) continue
    const cache = await caches.open(name)
    for (const request of await cache.keys()) {
      const url = new URL(request.url)
      if (url.origin !== indexUrl.origin || url.pathname !== indexUrl.pathname) continue
      const res = await cache.match(request)
      if (!res) continue
      const src = firstScriptSrc(await res.text(), indexUrl.href)
      if (src) scripts.push(src)
    }
  }
  return scripts
}

export async function detectInstalledBuild(deps: InstalledBuildDeps = {}): Promise<InstalledBuild> {
  const controllerPresent = deps.controllerPresent ?? defaultControllerPresent
  const runningScriptSrc = deps.runningScriptSrc ?? defaultRunningScriptSrc
  const precachedIndexScripts = deps.precachedIndexScripts ?? defaultPrecachedIndexScripts
  const timeoutMs = deps.timeoutMs ?? DETECT_TIMEOUT_MS

  if (!controllerPresent()) return 'unknown'
  const running = runningScriptSrc()
  if (!running) return 'unknown'

  const scripts = await withTimeout(
    (async () => (await precachedIndexScripts()) ?? [])(),
    timeoutMs,
    []
  )
  if (scripts.length === 0) return 'unknown'
  return scripts.some((src) => src !== running) ? 'different' : 'same'
}
