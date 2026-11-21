import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { loadFiles, loadMirrorMeta, saveMirrorMeta, upsertFile } from './mirror/store'
import { listRecent, recordOpen } from './reader/reading'
import { wipeDb } from './test/wipeDb'
import { waitFor } from './test/wait'
import { button } from './test/dom'

// SW 更新管道在 App 集成测试里不关心：假成空适配器（见 CLAUDE.md 测试缝约定）。
vi.mock('virtual:pwa-register/preact', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {}
  })
}))

// 票 19 集成：设置页清空笔记镜像后，App 的列表 / 最近 / 同步横幅同步复位；
// 清空删除了 meta，所以随后「刷新」不会被 commitSha 版本门短路。

async function seed(): Promise<void> {
  await saveSettings({
    token: 'ghp_test_dummy',
    owner: 'me',
    repo: 'fixtures',
    autoSync: false
  })
  await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
  await saveMirrorMeta({ commitSha: 'abc', syncedAt: 1000 })
  await recordOpen('a.md')
}

function installFetchStub(): { trees: number; contents: number } {
  const net = { trees: 0, contents: 0 }
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const u = String(input)
    if (u.includes('/git/trees/HEAD')) {
      net.trees++
      return new Response(
        JSON.stringify({
          sha: 'abc',
          truncated: false,
          tree: [{ path: 'a.md', mode: '100644', type: 'blob', sha: 'newsha', size: 9 }]
        }),
        { status: 200 }
      )
    }
    if (u.includes('/contents/a.md')) {
      net.contents++
      return new Response('# refreshed', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }
    return new Response(JSON.stringify({ message: 'unknown route' }), { status: 500 })
  })
  return net
}

/** 等真实的 IDB 写入落地（同步是异步的，net 计数先到）。 */
async function until(check: () => Promise<boolean>, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 0))
  }
}

function mountApp(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  render(<App />, c)
  return c
}

describe('App 清空笔记镜像', () => {
  beforeEach(async () => {
    await wipeDb()
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('清空后首页复位、无旧「上次同步」；再刷新会真正重新拉取（不短路）', async () => {
    await seed()
    const net = installFetchStub()
    const c = mountApp()
    await waitFor(() => (c.textContent ?? '').includes('上次同步'))

    // 先在首页输入搜索词（清空后应回到空搜索框）
    const search = c.querySelector('.search-input') as HTMLInputElement
    search.value = 'a'
    search.dispatchEvent(new Event('input'))

    button(c, '设置').click()
    await waitFor(() => (c.textContent ?? '').includes('清空笔记镜像'))
    button(c, '清空笔记镜像').click()
    await waitFor(() => (c.textContent ?? '').includes('将删除本机镜像'))
    button(c, '确认清空').click()
    await waitFor(() => (c.textContent ?? '').includes('已清空本机笔记'))

    expect(await loadFiles()).toEqual([])
    expect(await loadMirrorMeta()).toBeNull()
    expect(await listRecent()).toEqual([])

    button(c, '返回').click()
    await waitFor(() => (c.textContent ?? '').includes('还没有笔记'))
    expect(c.textContent).not.toContain('上次同步')

    button(c, '刷新').click()
    await until(async () => (await loadFiles()).length > 0)

    // meta 已删：同一棵树（sha 仍为 abc）也会真正拉取内容，而不是被版本门短路
    const files = await loadFiles()
    expect(files.map((f) => f.path)).toEqual(['a.md'])
    expect(files[0].content).toBe('# refreshed')
    expect(net.contents).toBeGreaterThanOrEqual(1)

    // 清空时 query 已复位：重新有笔记后搜索框是空的
    await waitFor(
      () => (c.querySelector('.search-input') as HTMLInputElement | null)?.value === ''
    )
    expect((c.querySelector('.search-input') as HTMLInputElement).value).toBe('')
  })
})
