import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { upsertFile } from './mirror/store'
import { waitFor } from './test/wait'
import { wipeDb } from './test/wipeDb'
import { NOT_LOADED_IMG } from './assets/wire'

// SW 更新管道在 App 集成测试里不关心：把 virtual:pwa-register/preact 这个模块缝假成
// 空适配器（真实引擎是浏览器 SW 生命周期，jsdom 里不跑、也不该被跑）。
vi.mock('virtual:pwa-register/preact', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {}
  })
}))

// 23 · 资源自动下载开关（集成）：关闭后打开笔记不得发起任何资源请求；
// 「本篇资源全下」是显式动作，仍要下载并回填。

function file(path: string, content: string) {
  return { path, sha: `sha-${path}`, content, size: content.length, status: 'ok' as const }
}

function shadowOf(c: HTMLElement): ShadowRoot | null {
  const host = c.querySelector('.reader') as (HTMLElement & { shadowRoot: ShadowRoot }) | null
  return host?.shadowRoot ?? null
}

function buttonByText(c: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...c.querySelectorAll('button')].find((b) => b.textContent === text) as
    | HTMLButtonElement
    | undefined
}

describe('23 · 资源自动下载开关（集成）', () => {
  let assetUrls: string[]

  beforeEach(async () => {
    await wipeDb()
    assetUrls = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('img/a.png')) assetUrls.push(url)
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => new Uint8Array([104, 105]).buffer,
        json: async () => ({}),
        text: async () => 'hi'
      } as unknown as Response
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('关闭后打开笔记零资源请求、图片显示「未下载」；「全下」后才请求并回填', async () => {
    await saveSettings({
      token: '',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false,
      autoDownloadAssets: false
    })
    await upsertFile(file('a.md', '# 甲\n![图](img/a.png)'))

    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)

    await waitFor(() => buttonByText(c, 'a.md') != null)
    buttonByText(c, 'a.md')!.click()

    await waitFor(() => shadowOf(c)?.querySelector('img') != null)
    // 等 cached() 的异步回填落地（本地未缓存 → 保持「未下载」）
    await new Promise((r) => setTimeout(r, 0))

    const img = shadowOf(c)!.querySelector('img')!
    expect(img.getAttribute('src')).toBe(NOT_LOADED_IMG)
    expect(assetUrls).toEqual([])

    buttonByText(c, '全下')!.click()
    await waitFor(
      () => (shadowOf(c)?.querySelector('img')?.getAttribute('src') ?? '').startsWith('data:image/png')
    )
    expect(assetUrls.length).toBe(1)
    expect(shadowOf(c)!.querySelector('img')!.getAttribute('src')).toBe(
      'data:image/png;base64,aGk='
    )
  })
})
