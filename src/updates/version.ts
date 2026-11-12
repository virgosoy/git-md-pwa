// U1 · 更新版本纯逻辑：无副作用，输入输出都是已知字面量，便于单测锁死。
// 依赖方向：只依赖外界注入的 fetch，不碰 DOM / 计时器 / IndexedDB。

/** 构建时经 vite define 注入的当前版本串；开发/测试环境（define 未替换）回退 'dev' */
export const CURRENT_APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : 'dev'

/** 版本串形状：v<semver>[+<git短sha>]，如 v0.0.1+5f8124d */
const VERSION_RE = /^v\d+\.\d+\.\d+.*$/

export function isVersionString(v: string): boolean {
  return VERSION_RE.test(v)
}

/**
 * 比较两个版本串：负=a 旧，0=相同，正=a 新。
 * semver 三段数字优先；尾串（含 git sha）作为同 semver 时的决胜项，字典序。
 */
export function compareVersions(a: string, b: string): number {
  const am = /^v(\d+)\.(\d+)\.(\d+)(.*)$/.exec(a)
  const bm = /^v(\d+)\.(\d+)\.(\d+)(.*)$/.exec(b)
  if (!am || !bm) return a.localeCompare(b)
  for (let i = 1; i <= 3; i++) {
    const d = Number(am[i]) - Number(bm[i])
    if (d !== 0) return d
  }
  return am[4].localeCompare(bm[4])
}

/**
 * Q8 判定：同版本只提示一次。
 * live 必须是合法版本串且 ≠ 上次已提示过的版本，才算「值得提示」。
 * live 为空/非法 → false（识别不了版本就不该基于版本号弹横幅）。
 */
export function shouldPrompt(live: string, lastPrompted: string): boolean {
  if (!live || !isVersionString(live)) return false
  return live !== lastPrompted
}

/**
 * 自动检测路径的兜底：取不到线上版本（离线等）时，logic 无法判定版本差异，
 * 但仍应提示「有新版本」通用文案——所以拿不到 live 一律视为需要提示。
 */
export function bannerNeeded(live: string | null, lastPrompted: string): boolean {
  return live === null || shouldPrompt(live, lastPrompted)
}

interface LiveVersionPayload {
  version?: unknown
}

/**
 * 拉取线上 version.json（网络新鲜值，不带缓存）。
 * 失败/非 2xx/字段缺失 → 返回 null（调用方据此走 bannerNeeded 的兜底）。
 * fetchFn 可注入，测试给 stub。
 */
export async function fetchLiveVersion(
  base = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(`${base}version.json?t=${Date.now()}`)
    if (!res.ok) return null
    const data = (await res.json()) as LiveVersionPayload
    return typeof data.version === 'string' && data.version ? data.version : null
  } catch {
    return null
  }
}
