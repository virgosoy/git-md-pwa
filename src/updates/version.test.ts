import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  compareVersions,
  shouldPrompt,
  bannerNeeded,
  isVersionString,
  fetchLiveVersion
} from './version'

// U1 单测：版本比较 / Q8 提示闸门 / 线上版本拉取，全部用已知字面量，不拍快照。

describe('compareVersions', () => {
  it('semver 数字段决定新旧', () => {
    expect(compareVersions('v0.0.1+abc', 'v0.0.2+abc')).toBeLessThan(0)
    expect(compareVersions('v1.9.0+abc', 'v2.0.0+abc')).toBeLessThan(0)
    expect(compareVersions('v2.0.0+abc', 'v1.9.0+abc')).toBeGreaterThan(0)
  })

  it('同 semver：尾串（git sha）决胜，字典序', () => {
    expect(compareVersions('v0.0.1+aaa', 'v0.0.1+bbb')).toBeLessThan(0)
    expect(compareVersions('v0.0.1+bbb', 'v0.0.1+aaa')).toBeGreaterThan(0)
  })

  it('完全相同的版本串相等', () => {
    expect(compareVersions('v0.0.1+5f8124d', 'v0.0.1+5f8124d')).toBe(0)
  })
})

describe('shouldPrompt（Q8：同版本只提示一次）', () => {
  it('live 与已提示版本不同 → 提示', () => {
    expect(shouldPrompt('v0.0.2+zzz', 'v0.0.1+aaa')).toBe(true)
  })

  it('live 与已提示版本相同 → 不提示', () => {
    expect(shouldPrompt('v0.0.2+zzz', 'v0.0.2+zzz')).toBe(false)
  })

  it('live 为空 / 非法（识别不了版本）→ 不提示', () => {
    expect(shouldPrompt('', 'v0.0.1+aaa')).toBe(false)
    expect(shouldPrompt('dev', 'v0.0.1+aaa')).toBe(false)
    expect(shouldPrompt('v0.0.2+zzz', '')).toBe(true) // 从未提示过 → 提示
  })
})

describe('bannerNeeded（兜底）', () => {
  it('取不到线上版本（null）→ 仍提示通用文案', () => {
    expect(bannerNeeded(null, 'v0.0.2+zzz')).toBe(true)
  })

  it('取到版本时沿用 shouldPrompt', () => {
    expect(bannerNeeded('v0.0.2+zzz', 'v0.0.1+aaa')).toBe(true)
    expect(bannerNeeded('v0.0.2+zzz', 'v0.0.2+zzz')).toBe(false)
  })
})

describe('isVersionString', () => {
  it('只认 v<semver>[+…] 形状', () => {
    expect(isVersionString('v0.0.1+5f8124d')).toBe(true)
    expect(isVersionString('v1.10.0')).toBe(true)
    expect(isVersionString('dev')).toBe(false)
    expect(isVersionString('')).toBe(false)
  })
})

describe('fetchLiveVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('2xx + 合法 version → 返回版本串', async () => {
    const fetchFn = vi.fn<
      (input: string | URL | Request) => Promise<Response>
    >(async () => new Response(JSON.stringify({ version: 'v0.0.2+zzz' }), { status: 200 }))
    await expect(fetchLiveVersion('http://x/', fetchFn)).resolves.toBe('v0.0.2+zzz')
    // 请求带缓存击穿参数
    expect(String(fetchFn.mock.calls[0]?.[0])).toMatch(/version\.json\?t=\d+/)
  })

  it('非 2xx → null', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 404 }))
    await expect(fetchLiveVersion('http://x/', fetchFn)).resolves.toBeNull()
  })

  it('字段缺失 / 类型不对 → null', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    await expect(fetchLiveVersion('http://x/', fetchFn)).resolves.toBeNull()
  })

  it('抛异常（离线）→ null', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(fetchLiveVersion('http://x/', fetchFn)).resolves.toBeNull()
  })
})
