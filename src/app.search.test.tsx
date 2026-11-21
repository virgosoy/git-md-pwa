import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { upsertFile } from './mirror/store'
import { saveScroll } from './reader/reading'
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

  it('滚到列表底部后输入查询 → 进入结果列表时回顶', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    const main = c.querySelector('.app__main') as HTMLElement
    main.scrollTop = 999
    expect(main.scrollTop).toBe(999)

    setSearch(c, '排障')
    await flushFrames()

    expect(c.querySelectorAll('.search-item').length).toBe(1)
    expect(main.scrollTop).toBe(0)
  })

  it('结果列表里增删字 → 保持滚动位置不动', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    const main = c.querySelector('.app__main') as HTMLElement
    main.scrollTop = 999

    setSearch(c, '排障')
    await flushFrames()
    main.scrollTop = 500
    setSearch(c, '部署')
    await flushFrames()
    expect(main.scrollTop).toBe(500)
  })

  it('清空搜索结果 → 回到进入搜索前的列表位置', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    const main = c.querySelector('.app__main') as HTMLElement
    main.scrollTop = 999

    setSearch(c, '排障')
    await flushFrames()
    expect(main.scrollTop).toBe(0)

    // 清空（等价点 x）→ 恢复全量列表并回到进入搜索前的位置
    setSearch(c, '')
    await flushFrames()
    expect(c.textContent).toContain('README.md')
    expect(main.scrollTop).toBe(999)
  })

  // 票 21：点标题行 → 打开笔记并跳到该标题（锚点优先于阅读位置）
  it('点标题行 → 打开该笔记并跳到该标题', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    await saveScroll('docs/归档.md', 500)
    render(<App />, c)
    await flushFrames()

    setSearch(c, '排障')
    await flushFrames()
    ;(c.querySelector('.search-item__heading') as HTMLElement).click()
    await waitFor(() => c.querySelector('.reader') != null)
    await flushFrames()

    expect(c.querySelector('.app__title--trunc')?.textContent).toBe('docs/归档.md')
    const host = c.querySelector('.reader') as HTMLElement & { shadowRoot: ShadowRoot }
    expect(host.shadowRoot.querySelector('h2')?.textContent).toBe('部署排障')
    // jsdom 几何为 0：目标 = 阅读位置 500 - 12
    expect(host.scrollTop).toBe(488)
  })

  // 票 21：标题在渲染后对不上 → 普通打开 + 提示（4 秒自动消失）
  it('标题定位失败 → 普通打开并提示，4 秒后提示自动消失', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)
    await flushFrames()

    // 索引来自 App 启动时的 files 快照；改库不刷新状态 → 命中仍在，打开时正文已换掉该标题
    await upsertFile(file('docs/归档.md', '# 归档记录\n## 换了标题'))
    setSearch(c, '排障')
    await flushFrames()
    ;(c.querySelector('.search-item__heading') as HTMLElement).click()
    await waitFor(() => c.querySelector('.reader') != null)
    await flushFrames()

    expect(c.querySelector('.app__title--trunc')?.textContent).toBe('docs/归档.md')
    expect(c.querySelector('.notice')?.textContent).toContain('未找到该标题')

    await new Promise((r) => setTimeout(r, 4200))
    await flushFrames()
    expect(c.querySelector('.notice')).toBeNull()
  })
})

