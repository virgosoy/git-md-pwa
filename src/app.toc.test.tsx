import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { upsertFile } from './mirror/store'
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

// 11 · 点 TOC「固定」只切换固定态，面板保持展开不重建（集成：根因在 assetLoader
// 依赖收敛——开关类设置变化不应触发 reader shadow 重建）。

function file(path: string, content: string) {
  return { path, sha: `sha-${path}`, content, size: content.length, status: 'ok' as const }
}

async function flushFrames(n = 8): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

/** 轮询直到 shadow 里出现 TOC 开关（openNote 经过 IDB + recordOpen，比固定帧更稳）。 */
async function flushUntilToc(c: HTMLElement): Promise<void> {
  const isDone = () => {
    const host = c.querySelector('.reader') as
      | (HTMLElement & { shadowRoot: ShadowRoot })
      | null
    return host != null && !!host.shadowRoot.querySelector('.reader-toc__toggle')
  }
  for (let i = 0; i < 40 && !isDone(); i++) {
    await new Promise((r) => setTimeout(r, 10))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

function shadowOf(c: HTMLElement): ShadowRoot {
  const host = c.querySelector('.reader') as HTMLElement & { shadowRoot: ShadowRoot }
  return host.shadowRoot
}

describe('App TOC 固定按钮（集成）', () => {
  beforeEach(async () => {
    await wipeDb()
    await saveSettings({ token: '', owner: 'me', repo: 'fixtures', autoSync: false })
    await upsertFile(file('笔记.md', '# 甲\n\n## 乙\n\n## 丙'))
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('点「固定」只切换固定态，面板保持展开、DOM 不重建', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    // 首页打开「笔记.md」
    const noteBtn = [...c.querySelectorAll('button')].find((b) => b.textContent === '笔记.md')
    expect(noteBtn).toBeTruthy()
    noteBtn!.click()
    await flushUntilToc(c)

    const root = shadowOf(c)
    const toggle = root.querySelector('.reader-toc__toggle') as HTMLElement
    const pin = root.querySelector('.reader-toc__pin') as HTMLElement
    toggle.click() // 展开面板
    const panel = root.querySelector('.reader-toc__panel') as HTMLElement
    expect(panel.classList.contains('is-open')).toBe(true)

    pin.click() // 固定 → 触发 App saveSettings → settings 引用变化
    await flushFrames()

    // 关键断言：面板保持展开、元素未被重建、固定态已切换
    expect(root.querySelector('.reader-toc__panel') as HTMLElement).toBe(panel)
    expect(panel.classList.contains('is-open')).toBe(true)
    expect(pin.classList.contains('is-active')).toBe(true)
    expect(pin.getAttribute('aria-pressed')).toBe('true')
  })
})
