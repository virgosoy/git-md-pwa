import { describe, it, expect } from 'vitest'
import { detectInstalledBuild } from './installed'

const RUNNING = 'https://example.test/git-md-pwa/assets/index-aaa.js'
const NEWER = 'https://example.test/git-md-pwa/assets/index-bbb.js'

function deps(overrides: {
  controllerPresent?: () => boolean
  runningScriptSrc?: () => string | null
  precachedIndexScripts?: () => Promise<string[]>
  timeoutMs?: number
}): {
  controllerPresent: () => boolean
  runningScriptSrc: () => string | null
  precachedIndexScripts: () => Promise<string[]>
  timeoutMs?: number
} {
  return {
    controllerPresent: () => true,
    runningScriptSrc: () => RUNNING,
    precachedIndexScripts: async () => [NEWER],
    ...overrides
  }
}

describe('detectInstalledBuild', () => {
  it('页面没有 Service Worker 控制 → unknown（不能据此下结论）', async () => {
    const result = await detectInstalledBuild(deps({ controllerPresent: () => false }))
    expect(result).toBe('unknown')
  })

  it('预缓存首页引用的脚本与当前页面不同 → different（新构建已装好）', async () => {
    expect(await detectInstalledBuild(deps({}))).toBe('different')
  })

  it('预缓存首页引用的脚本就是当前页面在跑的 → same', async () => {
    const precachedIndexScripts = async () => [RUNNING]
    expect(await detectInstalledBuild(deps({ precachedIndexScripts }))).toBe('same')
  })

  it('同一预缓存同时有旧/新两份首页（新 SW 等着接管）→ different', async () => {
    const precachedIndexScripts = async () => [RUNNING, NEWER]
    expect(await detectInstalledBuild(deps({ precachedIndexScripts }))).toBe('different')
  })

  it('预缓存里没有首页 → unknown', async () => {
    const precachedIndexScripts = async () => []
    expect(await detectInstalledBuild(deps({ precachedIndexScripts }))).toBe('unknown')
  })

  it('取不到当前页面脚本 → unknown', async () => {
    expect(await detectInstalledBuild(deps({ runningScriptSrc: () => null }))).toBe('unknown')
  })

  it('读预缓存抛错 → unknown', async () => {
    const precachedIndexScripts = async (): Promise<string[]> => {
      throw new Error('boom')
    }
    expect(await detectInstalledBuild(deps({ precachedIndexScripts }))).toBe('unknown')
  })

  it('读预缓存悬挂 → 超时后返回 unknown', async () => {
    const precachedIndexScripts = () => new Promise<string[]>(() => {})
    expect(await detectInstalledBuild(deps({ precachedIndexScripts, timeoutMs: 20 }))).toBe(
      'unknown'
    )
  })
})
