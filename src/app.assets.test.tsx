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

/** 票 24：「全下」回填有 300ms 防抖，等待时要给真实定时器留出时间（waitFor 只轮询微任务）。 */
async function waitUntil(predicate: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10))
  }
}

function imgSrcs(c: HTMLElement): string[] {
  return [...(shadowOf(c)?.querySelectorAll('img') ?? [])].map(
    (img) => img.getAttribute('src') ?? ''
  )
}

function okResponse(bytes: number[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    json: async () => ({}),
    text: async () => 'hi'
  } as unknown as Response
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
    await waitUntil(
      () => (shadowOf(c)?.querySelector('img')?.getAttribute('src') ?? '').startsWith('data:image/png')
    )
    expect(assetUrls.length).toBe(1)
    expect(shadowOf(c)!.querySelector('img')!.getAttribute('src')).toBe(
      'data:image/png;base64,aGk='
    )
  })

  it('「全下」逐项回填：慢资源不阻塞快的，按钮显示「下载中…」并在结束后复原', async () => {
    await saveSettings({
      token: '',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false,
      autoDownloadAssets: false
    })
    await upsertFile(file('b.md', '# 乙\n\n![快](img/fast.png)\n\n![慢](img/slow.png)'))

    let releaseSlow: () => void = () => {}
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve
    })
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('img/slow.png')) {
        await slowGate
        return okResponse([115, 108]) // "sl"
      }
      return okResponse([102, 97]) // "fa"
    })

    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)

    await waitUntil(() => buttonByText(c, 'b.md') != null)
    buttonByText(c, 'b.md')!.click()
    await waitUntil(() => shadowOf(c)?.querySelectorAll('img').length === 2)
    await new Promise((r) => setTimeout(r, 0))
    expect(imgSrcs(c)).toEqual([NOT_LOADED_IMG, NOT_LOADED_IMG])

    buttonByText(c, '全下')!.click()
    // 慢资源还挂着：快的应先回填，按钮保持「下载中…」
    await waitUntil(() => imgSrcs(c)[0].startsWith('data:image/png'))
    expect(imgSrcs(c)).toEqual(['data:image/png;base64,ZmE=', NOT_LOADED_IMG])
    expect(buttonByText(c, '下载中…')?.disabled).toBe(true)

    releaseSlow()
    await waitUntil(() => imgSrcs(c).every((s) => s.startsWith('data:image/png')))
    expect(imgSrcs(c)).toEqual(['data:image/png;base64,ZmE=', 'data:image/png;base64,c2w='])
    await waitUntil(() => buttonByText(c, '全下') != null)
    expect(buttonByText(c, '全下')!.disabled).toBe(false)
  })
})
