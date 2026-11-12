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

// S3 · 首页全局标题搜索（集成）：输入片段过滤列表，条目带「标题/文件」标签，离线可搜

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

describe('首页全局标题搜索（集成）', () => {
  beforeEach(async () => {
    await wipeDb()
    await saveSettings({ token: '', owner: 'me', repo: 'fixtures', autoSync: false })
    await upsertFile(file('docs/归档.md', '# 归档记录\n## 部署排障'))
    await upsertFile(file('README.md', '无标题反正'))
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('输入标题片段 → 仅显示命中项，带「标题 H2」标签', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    expect(c.textContent).toContain('docs/归档.md')
    setSearch(c, '排障')
    await flushFrames()

    expect(c.textContent).toContain('部署排障')
    expect(c.textContent).toContain('标题 H2')
    expect(c.textContent).not.toContain('README.md')
  })

  it('标题与路径双命中 → 「文件」与「标题 H1」标签并存；清空恢复全量', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    setSearch(c, '归档')
    await flushFrames()

    expect(c.textContent).toContain('文件')
    expect(c.textContent).toContain('标题 H1')
    expect(c.textContent).toContain('docs/归档.md')

    setSearch(c, '')
    await flushFrames()
    expect(c.textContent).toContain('README.md')
  })
})
