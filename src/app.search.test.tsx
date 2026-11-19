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

// S3 · 首页全局搜索（集成）：输入片段过滤列表；展示 =「文件名恒为主行 + 标题逐条 H 徽标行
// + 目录 + 正文摘录」，离线可搜。断言按新结构走（.search-item__name / __heading / __snippet）。

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

/** 第一张结果卡片的结构快照：主行名、各标题行、各正文摘录 */
function firstResult(container: HTMLElement): { name: string; headings: string[]; snippets: string[] } {
  const name = container.querySelector('.search-item__name')?.textContent ?? ''
  const headings = [...container.querySelectorAll('.search-item__heading')].map((el) => el.textContent ?? '')
  const snippets = [...container.querySelectorAll('.search-item__snippet')].map((el) => el.textContent ?? '')
  return { name, headings, snippets }
}

describe('首页全局搜索（集成）', () => {
  beforeEach(async () => {
    await wipeDb()
    await saveSettings({ token: '', owner: 'me', repo: 'fixtures', autoSync: false })
    await upsertFile(file('docs/归档.md', '# 归档记录\n## 部署排障'))
    await upsertFile(file('README.md', '今天下雨了'))
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('输入标题片段 → 仅显示命中项：文件名主行 + H 徽标标题行', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    expect(c.textContent).toContain('docs/归档.md')
    setSearch(c, '排障')
    await flushFrames()

    expect(c.querySelectorAll('.search-item').length).toBe(1)
    expect(firstResult(c)).toEqual({ name: '归档', headings: ['H2部署排障'], snippets: [] })
    expect(c.textContent).not.toContain('README.md')
  })

  it('文件名与标题双命中 → 主行与标题行各自独立展示；清空恢复全量', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    setSearch(c, '归档')
    await flushFrames()

    const r = firstResult(c)
    expect(r.name).toBe('归档')
    expect(r.headings).toContain('H1归档记录')
    expect(c.textContent).toContain('docs/')

    setSearch(c, '')
    await flushFrames()
    expect(c.textContent).toContain('README.md')
  })

  it('正文命中 → 文件名主行 + 正文摘录，无标题行', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    setSearch(c, '下雨')
    await flushFrames()

    expect(c.querySelectorAll('.search-item').length).toBe(1)
    const r = firstResult(c)
    expect(r.name).toBe('README')
    expect(r.headings).toEqual([])
    expect(r.snippets.join('')).toContain('今天下雨了')
    expect(c.textContent).not.toContain('docs/')
  })
})
