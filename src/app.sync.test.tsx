import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { wipeDb } from './test/wipeDb'

// SW 更新管道在 App 集成测试里不关心：把 virtual:pwa-register/preact 这个模块缝假成
// 空适配器（真实引擎是浏览器 SW 生命周期，jsdom 里不跑、也不该被跑）。
vi.mock('virtual:pwa-register/preact', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {}
  })
}))

// S4 · 同步开关守门（集成）：完成定义里「关掉开关后重开不请求网络」。
// 用 stub fetch 计数 api.github.com 的访问。

async function seedSettings(autoSync: boolean): Promise<void> {
  await saveSettings({
    token: 'ghp_test_dummy',
    owner: 'me',
    repo: 'fixtures',
    autoSync
  })
}

async function flushFrames(n = 6): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

function installFetchStub(): { calls: number } {
  const net = { calls: 0 }
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    if (String(input).includes('api.github.com')) net.calls++
    return new Response(JSON.stringify({ sha: 'abc', tree: [], truncated: false }), {
      status: 200
    })
  })
  return net
}

function mountApp(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  render(<App />, c)
  return c
}

describe('App 同步开关守门', () => {
  beforeEach(async () => {
    await wipeDb()
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('autoSync=false：挂载后不请求 GitHub', async () => {
    await seedSettings(false)
    const net = installFetchStub()
    mountApp()
    await flushFrames()
    expect(net.calls).toBe(0)
  })

  it('autoSync=true：挂载后自动同步一次', async () => {
    await seedSettings(true)
    const net = installFetchStub()
    mountApp()
    await flushFrames()
    expect(net.calls).toBeGreaterThanOrEqual(1)
  })
})
