import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { upsertFile } from './mirror/store'
import { waitFor } from './test/wait'
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

// 22 · 从笔记返回首页时恢复列表滚动位置（集成）。
// jsdom 不做布局夹取，因此进入阅读器后手动把主容器 scrollTop 归零，模拟真实浏览器行为；
// 返回后应精确还原离开首页时的位置。

function file(path: string, content: string) {
  return { path, sha: `sha-${path}`, content, size: content.length, status: 'ok' as const }
}

async function flushFrames(n = 6): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

function setSearch(container: HTMLElement, value: string): void {
  const input = container.querySelector('.search-input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function shadowOf(c: HTMLElement): ShadowRoot | null {
  const host = c.querySelector('.reader') as (HTMLElement & { shadowRoot: ShadowRoot }) | null
  return host?.shadowRoot ?? null
}

function clickBack(c: HTMLElement): void {
  const btn = [...c.querySelectorAll('button')].find((b) => b.textContent?.includes('返回'))
  expect(btn).toBeTruthy()
  ;(btn as HTMLElement).click()
}

describe('22 · 返回首页恢复滚动位置（集成）', () => {
  beforeEach(async () => {
    await wipeDb()
    await saveSettings({ token: '', owner: 'me', repo: 'fixtures', autoSync: false })
    await upsertFile(file('docs/归档.md', '# 归档记录\n## 部署排障'))
    await upsertFile(file('README.md', '今天下雨了'))
    await upsertFile(file('a.md', '# 甲\n[去乙](b.md)'))
    await upsertFile(file('b.md', '# 乙'))
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('搜索结果点标题 → 返回 → 回到离开时的结果位置', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    const main = c.querySelector('.app__main') as HTMLElement
    setSearch(c, '排障')
    await flushFrames()
    main.scrollTop = 420

    ;(c.querySelector('.search-item__heading') as HTMLElement).click()
    await waitFor(() => c.querySelector('.reader') != null)
    await flushFrames()
    main.scrollTop = 0 // 模拟阅读器 flush 布局把主容器夹到 0

    clickBack(c)
    await flushFrames()

    expect(main.scrollTop).toBe(420)
    // 查询与结果列表仍在（返回不重置搜索态）
    expect((c.querySelector('.search-input') as HTMLInputElement).value).toBe('排障')
    expect(c.querySelectorAll('.search-item').length).toBe(1)
  })

  it('从全部笔记打开 → 返回 → 回到列表位置', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    const main = c.querySelector('.app__main') as HTMLElement
    main.scrollTop = 640

    const noteBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'README.md')
    expect(noteBtn).toBeTruthy()
    noteBtn!.click()
    await waitFor(() => c.querySelector('.reader') != null)
    await flushFrames()
    main.scrollTop = 0

    clickBack(c)
    await flushFrames()

    expect(main.scrollTop).toBe(640)
  })

  it('阅读中经内链切篇再返回 → 仍还原最初离开首页的位置', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    const main = c.querySelector('.app__main') as HTMLElement
    main.scrollTop = 300

    const noteBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === 'a.md')
    expect(noteBtn).toBeTruthy()
    noteBtn!.click()
    await waitFor(() => c.querySelector('.app__title--trunc')?.textContent === 'a.md')
    await waitFor(() => shadowOf(c)?.querySelector('a') != null)

    const link = shadowOf(c)!.querySelector('a') as HTMLAnchorElement
    link.click()
    await waitFor(() => c.querySelector('.app__title--trunc')?.textContent === 'b.md')
    await flushFrames()
    // 内链切篇时 current 非空，不得覆盖最初离开首页时的位置
    main.scrollTop = 0

    clickBack(c)
    await flushFrames()

    expect(main.scrollTop).toBe(300)
  })
})
