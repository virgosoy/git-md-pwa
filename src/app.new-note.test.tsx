import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { getFile, upsertFile } from './mirror/store'
import type { StoredFile } from './mirror/store'
import { loadDraft } from './write/draft'
import { listRecent } from './reader/reading'
import { waitFor } from './test/wait'
import { wipeDb } from './test/wipeDb'
import { button } from './test/dom'

vi.mock('virtual:pwa-register/preact', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {}
  })
}))

function file(path: string, content: string, sha = `sha-${path}`): StoredFile {
  return {
    path,
    sha,
    content,
    size: new TextEncoder().encode(content).byteLength,
    status: 'ok'
  }
}

function noteButton(c: HTMLElement, path: string): HTMLButtonElement | undefined {
  return [...c.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').startsWith(path)
  ) as HTMLButtonElement | undefined
}

interface Logged {
  url: string
  init: RequestInit
}

function record(log: Logged[], input: RequestInfo | URL, init?: RequestInit): void {
  log.push({ url: String(input), init: init ?? {} })
}

function putBody(entry: Logged): Record<string, string> {
  return JSON.parse(String(entry.init.body)) as Record<string, string>
}

const CREATE_OK = JSON.stringify({ content: { sha: 'newsha' }, commit: { sha: 'c1' } })

async function openPanel(c: HTMLElement): Promise<void> {
  await waitFor(() => c.querySelector('button[aria-label="新建笔记"]') != null)
  ;(c.querySelector('button[aria-label="新建笔记"]') as HTMLButtonElement).click()
  await waitFor(() => c.querySelector('.new-note') != null)
}

async function fillName(c: HTMLElement, value: string): Promise<void> {
  const input = c.querySelector('.new-note__input') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => !button(c, '创建').disabled)
}

function chooseDir(c: HTMLElement, dir: string): void {
  const select = c.querySelector('.new-note__select') as HTMLSelectElement
  select.value = dir
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

async function openNewDirMode(c: HTMLElement): Promise<void> {
  button(c, '＋ 新建目录').click()
  await waitFor(() => c.querySelector('.new-note__dir-input') != null)
}

async function fillInput(
  c: HTMLElement,
  selector: string,
  value: string
): Promise<void> {
  const input = c.querySelector(selector) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => input.value === value)
}

async function fillNewDirName(c: HTMLElement, value: string): Promise<void> {
  await fillInput(c, '.new-note__name-input', value)
  await waitFor(() => !button(c, '创建目录并新建笔记').disabled)
}

describe('27 · 新建笔记（App 集成）', () => {
  let c: HTMLElement

  beforeEach(async () => {
    await wipeDb()
    c = document.createElement('div')
    document.body.appendChild(c)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  async function configure(
    files: StoredFile[] = [],
    opts: {
      writeBackEnabled?: boolean
      token?: string
      owner?: string
      repo?: string
    } = {}
  ): Promise<void> {
    await saveSettings({
      token: opts.token ?? 'ghp_test_dummy',
      owner: opts.owner ?? 'me',
      repo: opts.repo ?? 'fixtures',
      autoSync: false,
      writeBackEnabled: opts.writeBackEnabled ?? true,
      autoDownloadAssets: false
    })
    for (const f of files) await upsertFile(f)
  }

  it('回写关闭：首页没有「＋」', async () => {
    await configure([file('a.md', '# 甲\n')], { writeBackEnabled: false })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    expect(c.querySelector('button[aria-label="新建笔记"]')).toBeNull()
  })

  it('令牌为空：首页没有「＋」', async () => {
    await configure([file('a.md', '# 甲\n')], { token: '' })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    expect(c.querySelector('button[aria-label="新建笔记"]')).toBeNull()
  })

  it('缺 owner/repo：首页没有「＋」（门控与 currentWriteTarget 一致）', async () => {
    await configure([file('a.md', '# 甲\n')], { owner: '' })
    render(<App />, c)

    // 未配置仓库时首页显示设置页；等设置加载完成再断言，避免初始 null 的假阴性
    await waitFor(() => c.querySelector('.settings') != null)
    expect(c.querySelector('button[aria-label="新建笔记"]')).toBeNull()
  })

  it('目录下拉：根目录固定首项，包含镜像中的全部目录且默认根目录', async () => {
    await configure([
      file('a.md', '# 甲\n'),
      file('notes/b.md', '# 乙\n'),
      file('notes/sub/c.md', '# 丙\n')
    ])
    vi.stubGlobal('fetch', async () => {
      throw new Error('unexpected network')
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)

    const select = c.querySelector('.new-note__select') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['/', 'notes', 'notes/sub'])
    expect(select.value).toBe('/')
    expect(select.options[0].textContent).toBe('/（根目录）')
  })

  it('创建成功：不带 sha、提交说明与空正文；镜像/最近/编辑器/列表均更新', async () => {
    await configure([file('a.md', '# 甲\n')])
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      return new Response(CREATE_OK, { status: 201, statusText: 'Created' })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await fillName(c, '哑值')
    button(c, '创建').click()

    await waitFor(() => c.querySelector('.editor__text') != null)
    expect((c.querySelector('.editor__text') as HTMLTextAreaElement).value).toBe('')
    expect(c.querySelector('.new-note')).toBeNull()

    expect(log).toHaveLength(1)
    expect(log[0].url).toBe(
      'https://api.github.com/repos/me/fixtures/contents/%E5%93%91%E5%80%BC.md'
    )
    expect(log[0].init.method).toBe('PUT')
    expect(putBody(log[0])).toEqual({ message: '手机新建：哑值.md', content: '' })

    expect(await getFile('哑值.md')).toEqual({
      path: '哑值.md',
      sha: 'newsha',
      content: '',
      size: 0,
      status: 'ok'
    })
    expect((await listRecent()).map((r) => r.path)).toContain('哑值.md')

    // 编辑器返回 → 阅读器；再返回 → 首页（列表已含新条目）
    button(c, '‹ 返回').click()
    await waitFor(() => c.querySelector('.reader') != null)
    expect(c.querySelector('.app__title')?.textContent).toBe('哑值.md')
    button(c, '‹ 返回').click()
    await waitFor(() => noteButton(c, '哑值.md') != null)
  })

  it('选子目录创建：提交路径为「目录/文件名.md」', async () => {
    await configure([file('notes/b.md', '# 乙\n')])
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      return new Response(CREATE_OK, { status: 201, statusText: 'Created' })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'notes/b.md') != null)
    await openPanel(c)
    chooseDir(c, 'notes')
    await fillName(c, '新篇')
    button(c, '创建').click()

    await waitFor(() => c.querySelector('.editor__text') != null)
    expect(log[0].url).toBe(
      'https://api.github.com/repos/me/fixtures/contents/notes/%E6%96%B0%E7%AF%87.md'
    )
    expect(putBody(log[0]).message).toBe('手机新建：notes/新篇.md')
    expect(await getFile('notes/新篇.md')).toMatchObject({ sha: 'newsha', content: '' })
  })

  it('新建多级目录：一次 PUT 创建 父/新目录/首篇.md，中间层无直接文件也进入目录下拉', async () => {
    await configure([file('notes/b.md', '# 乙\n')])
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      return new Response(CREATE_OK, { status: 201, statusText: 'Created' })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'notes/b.md') != null)
    await openPanel(c)
    chooseDir(c, 'notes')
    await openNewDirMode(c)
    await fillInput(c, '.new-note__dir-input', ' a /b ')
    await fillNewDirName(c, '首篇')
    await waitFor(() => (c.textContent ?? '').includes('将创建：notes/a/b/首篇.md'))
    button(c, '创建目录并新建笔记').click()

    await waitFor(() => c.querySelector('.editor__text') != null)
    expect(log).toHaveLength(1)
    expect(log[0].url).toBe(
      'https://api.github.com/repos/me/fixtures/contents/notes/a/b/%E9%A6%96%E7%AF%87.md'
    )
    expect(putBody(log[0])).toEqual({
      message: '手机新建：notes/a/b/首篇.md',
      content: ''
    })
    expect(await getFile('notes/a/b/首篇.md')).toMatchObject({
      sha: 'newsha',
      content: ''
    })

    // 返回首页：列表按顶层目录分组并显示完整路径；再开弹层，所有祖先目录都可选
    button(c, '‹ 返回').click()
    await waitFor(() => c.querySelector('.reader') != null)
    button(c, '‹ 返回').click()
    await waitFor(() => noteButton(c, 'notes/a/b/首篇.md') != null)
    await openPanel(c)
    const select = c.querySelector('.new-note__select') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual([
      '/',
      'notes',
      'notes/a',
      'notes/a/b'
    ])
  })

  it('根目录下新建多级目录：path 不带前导 /', async () => {
    await configure([file('a.md', '# 甲\n')])
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      return new Response(CREATE_OK, { status: 201, statusText: 'Created' })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await openNewDirMode(c)
    await fillInput(c, '.new-note__dir-input', 'a/b')
    await fillNewDirName(c, '首篇')
    button(c, '创建目录并新建笔记').click()

    await waitFor(() => c.querySelector('.editor__text') != null)
    expect(log[0].url).toBe(
      'https://api.github.com/repos/me/fixtures/contents/a/b/%E9%A6%96%E7%AF%87.md'
    )
    expect(putBody(log[0]).message).toBe('手机新建：a/b/首篇.md')
    expect(await getFile('a/b/首篇.md')).toMatchObject({ sha: 'newsha', content: '' })
  })

  it('新目录已存在：提示后继续在该目录新建笔记', async () => {
    await configure([file('notes/sub/c.md', '# 丙\n')])
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      return new Response(CREATE_OK, { status: 201, statusText: 'Created' })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'notes/sub/c.md') != null)
    await openPanel(c)
    chooseDir(c, 'notes')
    await openNewDirMode(c)
    await fillInput(c, '.new-note__dir-input', 'sub')
    await fillNewDirName(c, '新篇')
    await waitFor(() =>
      (c.textContent ?? '').includes('目录已存在，将直接在该目录新建笔记')
    )
    button(c, '创建目录并新建笔记').click()

    await waitFor(() => c.querySelector('.editor__text') != null)
    expect(log[0].url).toBe(
      'https://api.github.com/repos/me/fixtures/contents/notes/sub/%E6%96%B0%E7%AF%87.md'
    )
    expect(putBody(log[0]).message).toBe('手机新建：notes/sub/新篇.md')
  })

  it('非法新目录路径：创建禁用并提示；改成合法后恢复', async () => {
    await configure([file('a.md', '# 甲\n')])
    vi.stubGlobal('fetch', async () => {
      throw new Error('unexpected network')
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await openNewDirMode(c)
    await fillInput(c, '.new-note__dir-input', 'a//b')
    await fillInput(c, '.new-note__name-input', '篇')

    await waitFor(() => (c.textContent ?? '').includes('空目录名'))
    expect(button(c, '创建目录并新建笔记').disabled).toBe(true)

    await fillInput(c, '.new-note__dir-input', 'a/b')
    await waitFor(() => !button(c, '创建目录并新建笔记').disabled)
    expect((c.textContent ?? '').includes('空目录名')).toBe(false)
  })

  it('404：显示 GitHub 原始 message，弹层保留、镜像不变', async () => {
    await configure([file('a.md', '# 甲\n')])
    vi.stubGlobal('fetch', async () => {
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        statusText: 'Not Found'
      })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await openNewDirMode(c)
    await fillInput(c, '.new-note__dir-input', 'a/b')
    await fillNewDirName(c, '首篇')
    button(c, '创建目录并新建笔记').click()

    await waitFor(() => (c.textContent ?? '').includes('Not Found'))
    expect(c.querySelector('.new-note')).not.toBeNull()
    expect(await getFile('a/b/首篇.md')).toBeUndefined()
  })

  it('创建成功后清空首页搜索词（返回列表不被旧查询过滤）', async () => {
    await configure([
      file('a.md', '# 甲\n'),
      file('notes/b.md', '# 乙\n')
    ])
    vi.stubGlobal('fetch', async () => new Response(CREATE_OK, { status: 201, statusText: 'Created' }))
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    const search = c.querySelector('.search-input') as HTMLInputElement
    search.value = '不存在的查询'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => (c.textContent ?? '').includes('没有匹配'))
    await openPanel(c)
    await fillName(c, '新篇')
    button(c, '创建').click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    button(c, '‹ 返回').click()
    await waitFor(() => c.querySelector('.reader') != null)
    button(c, '‹ 返回').click()
    await waitFor(
      () => (c.querySelector('.search-input') as HTMLInputElement | null)?.value === ''
    )
    await waitFor(() => noteButton(c, '新篇.md') != null)
  })

  it('本地已有同名：不发请求，弹层提示且保留输入', async () => {
    await configure([file('notes/同名.md', '# 已存在\n')])
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      throw new Error('unexpected network')
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'notes/同名.md') != null)
    await openPanel(c)
    chooseDir(c, 'notes')
    await fillName(c, '同名')
    button(c, '创建').click()

    await waitFor(() => (c.textContent ?? '').includes('已存在同名笔记'))
    expect(log).toHaveLength(0)
    expect((c.querySelector('.new-note__input') as HTMLInputElement).value).toBe('同名')
    expect(c.querySelector('.new-note')).not.toBeNull()

    // 改动文件名后清掉上一次失败提示
    await fillName(c, '另一个')
    await waitFor(() => !(c.textContent ?? '').includes('已存在同名笔记'))
  })

  it('401：显示与票 26 一致的令牌无效提示', async () => {
    await configure([file('a.md', '# 甲\n')])
    vi.stubGlobal('fetch', async () => {
      return new Response(JSON.stringify({ message: 'Bad credentials' }), {
        status: 401,
        statusText: 'Unauthorized'
      })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await fillName(c, '新篇')
    button(c, '创建').click()

    await waitFor(() => (c.textContent ?? '').includes('令牌无效或已过期'))
    expect(c.textContent).toContain('Bad credentials')
    expect(c.querySelector('.new-note')).not.toBeNull()
  })

  it('远端 422 且 GET 确认存在：提示同名、保留输入、不发覆盖请求', async () => {
    await configure([file('a.md', '# 甲\n')])
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ message: "sha wasn't supplied" }), {
          status: 422,
          statusText: 'Unprocessable Entity'
        })
      }
      return new Response(
        JSON.stringify({ sha: 'remote', content: '', encoding: 'base64', size: 0 }),
        { status: 200, statusText: 'OK' }
      )
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await fillName(c, '远端已有')
    button(c, '创建').click()

    await waitFor(() => (c.textContent ?? '').includes('已存在同名笔记'))
    expect(log.filter((x) => x.init.method === 'PUT')).toHaveLength(1)
    expect((c.querySelector('.new-note__input') as HTMLInputElement).value).toBe('远端已有')
  })

  it('403：提示换读写令牌，弹层保留', async () => {
    await configure([file('a.md', '# 甲\n')])
    vi.stubGlobal('fetch', async () => {
      return new Response(
        JSON.stringify({ message: 'Resource not accessible by personal access token' }),
        { status: 403, statusText: 'Forbidden' }
      )
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await fillName(c, '新篇')
    button(c, '创建').click()

    await waitFor(() => (c.textContent ?? '').includes('写权限'))
    expect(c.querySelector('.new-note')).not.toBeNull()
  })

  it('断网：提示需要联网；弹层与输入保留，镜像与草稿不变', async () => {
    await configure([file('a.md', '# 甲\n')])
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await fillName(c, '离线篇')
    button(c, '创建').click()

    await waitFor(() => (c.textContent ?? '').includes('联网'))
    expect((c.querySelector('.new-note__input') as HTMLInputElement).value).toBe('离线篇')
    expect(await getFile('离线篇.md')).toBeUndefined()
    expect(await loadDraft('离线篇.md')).toBeUndefined()
  })

  it('连续点击「创建」只发一次 PUT', async () => {
    await configure([file('a.md', '# 甲\n')])
    let puts = 0
    let release: (() => void) | null = null
    const gate = new Promise<void>((r) => {
      release = r
    })
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts++
        await gate
      }
      return new Response(CREATE_OK, { status: 201, statusText: 'Created' })
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    await openPanel(c)
    await fillName(c, '连点')
    const create = button(c, '创建')
    create.click()
    create.click()
    await waitFor(() => puts === 1)
    release!()
    await waitFor(() => c.querySelector('.editor__text') != null)
    expect(puts).toBe(1)
  })
})
