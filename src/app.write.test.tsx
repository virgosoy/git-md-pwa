import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { getFile, upsertFile } from './mirror/store'
import type { StoredFile } from './mirror/store'
import { loadDraft, saveDraft } from './write/draft'
import { waitFor } from './test/wait'
import { wipeDb } from './test/wipeDb'
import { button } from './test/dom'

// SW 更新管道在 App 集成测试里不关心：把 virtual:pwa-register/preact 假成空适配器。
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

async function openNote(c: HTMLElement, path: string): Promise<void> {
  await waitFor(() => noteButton(c, path) != null)
  noteButton(c, path)!.click()
  await waitFor(() => c.querySelector('.reader') != null)
}

function shadowText(c: HTMLElement): string {
  const host = c.querySelector('.reader') as
    | (HTMLElement & { shadowRoot: ShadowRoot | null })
    | null
  return host?.shadowRoot?.textContent ?? ''
}

async function typeInEditor(c: HTMLElement, value: string): Promise<void> {
  const ta = c.querySelector('.editor__text') as HTMLTextAreaElement
  ta.value = value
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => !button(c, '保存').disabled)
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

const SAVE_OK = JSON.stringify({ content: { sha: 'b2' }, commit: { sha: 'c1' } })

describe('26 · 回写（App 集成）', () => {
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

  async function configure(writeBackEnabled = true): Promise<void> {
    await saveSettings({
      token: 'ghp_test_dummy',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false,
      writeBackEnabled,
      autoDownloadAssets: false
    })
    await upsertFile(file('a.md', '# 甲\n'))
  }

  it('开关关闭：没有编辑入口，草稿也不露出', async () => {
    await configure(false)
    await saveDraft({
      path: 'a.md',
      content: '# 草稿\n',
      baseSha: 'sha-a.md',
      eol: 'lf',
      updatedAt: 1
    })
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    expect(noteButton(c, 'a.md')?.textContent).toBe('a.md')
    await openNote(c, 'a.md')
    expect(c.querySelector('button[aria-label="编辑笔记"]')).toBeNull()
    expect(c.querySelector('.draft-banner')).toBeNull()
    expect(await loadDraft('a.md')).toBeDefined()
  })

  it('保存成功：PUT 带 sha/message/base64，镜像回填、草稿删除、阅读器更新', async () => {
    await configure()
    const log: Logged[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      return new Response(SAVE_OK, { status: 200, statusText: 'OK' })
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    await typeInEditor(c, '# 乙\n')

    button(c, '保存').click()
    await waitFor(() => (c.textContent ?? '').includes('已提交'))

    expect(log).toHaveLength(1)
    expect(log[0].url).toBe('https://api.github.com/repos/me/fixtures/contents/a.md')
    expect(log[0].init.method).toBe('PUT')
    const headers = log[0].init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-GitHub-Api-Version']).toBeUndefined()
    expect(putBody(log[0])).toEqual({
      message: '手机编辑：a.md',
      content: 'IyDkuZkK',
      sha: 'sha-a.md'
    })

    const saved = await getFile('a.md')
    expect(saved?.sha).toBe('b2')
    expect(saved?.content).toBe('# 乙\n')
    expect(saved?.size).toBe(6)
    expect(await loadDraft('a.md')).toBeUndefined()

    button(c, '‹ 返回').click()
    await waitFor(() => c.querySelector('.editor__text') == null)
    await waitFor(() => shadowText(c).includes('乙'))
    expect(shadowText(c)).not.toContain('甲')
  })

  it('409 冲突：预览远端后可覆盖，第二次 PUT 用远端 sha', async () => {
    await configure()
    const log: Logged[] = []
    let puts = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      if (init?.method === 'PUT') {
        puts++
        if (puts === 1) {
          return new Response(JSON.stringify({ message: 'sha does not match' }), {
            status: 409,
            statusText: 'Conflict'
          })
        }
        return new Response(SAVE_OK, { status: 200, statusText: 'OK' })
      }
      return new Response(
        JSON.stringify({
          sha: 'b9',
          content: 'IyDov5znq68K',
          encoding: 'base64',
          size: 9
        }),
        { status: 200, statusText: 'OK' }
      )
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    await typeInEditor(c, '# 我的\n')

    button(c, '保存').click()
    await waitFor(
      () => (c.querySelector('.conflict__title')?.textContent ?? '').includes('远端文件已更新')
    )
    expect(c.querySelector('.conflict__remote')?.textContent).toBe('# 远端\n')

    button(c, '覆盖远端').click()
    await waitFor(() => (c.textContent ?? '').includes('已提交'))

    expect(puts).toBe(2)
    const second = log.filter((x) => x.init.method === 'PUT')[1]
    expect(putBody(second)).toMatchObject({
      message: '手机编辑：a.md',
      content: 'IyDmiJHnmoQK',
      sha: 'b9'
    })
    expect((await getFile('a.md'))?.content).toBe('# 我的\n')
    expect(await loadDraft('a.md')).toBeUndefined()
  })

  it('远端已删除：预览面板提供重新创建，PUT 不带 sha', async () => {
    await configure()
    const log: Logged[] = []
    let puts = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      record(log, input, init)
      if (init?.method === 'PUT') {
        puts++
        if (puts === 1) {
          return new Response(JSON.stringify({ message: 'sha does not match' }), {
            status: 409,
            statusText: 'Conflict'
          })
        }
        return new Response(SAVE_OK, { status: 201, statusText: 'Created' })
      }
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        statusText: 'Not Found'
      })
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    await typeInEditor(c, '# 重新创建\n')

    button(c, '保存').click()
    await waitFor(
      () =>
        (c.querySelector('.conflict__title')?.textContent ?? '').includes('远端文件已被删除')
    )
    button(c, '在远端重新创建').click()
    await waitFor(() => (c.textContent ?? '').includes('已提交'))

    const second = log.filter((x) => x.init.method === 'PUT')[1]
    expect(putBody(second)).toEqual({
      message: '手机编辑：a.md',
      content: 'IyDph43mlrDliJvlu7oK'
    })
    expect((await getFile('a.md'))?.content).toBe('# 重新创建\n')
    expect(await loadDraft('a.md')).toBeUndefined()
  })

  it('冲突放弃：确认后加载远端版本、删除草稿并退出编辑器', async () => {
    await configure()
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ message: 'sha does not match' }), {
          status: 409,
          statusText: 'Conflict'
        })
      }
      return new Response(
        JSON.stringify({
          sha: 'b9',
          content: 'IyDov5znq68K',
          encoding: 'base64',
          size: 9
        }),
        { status: 200, statusText: 'OK' }
      )
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    await typeInEditor(c, '# 我的\n')

    button(c, '保存').click()
    await waitFor(
      () => (c.querySelector('.conflict__title')?.textContent ?? '').includes('远端文件已更新')
    )
    button(c, '放弃我的修改').click()
    await waitFor(() => (c.textContent ?? '').includes('确定放弃手机上的修改'))
    button(c, '确定放弃').click()

    await waitFor(() => c.querySelector('.editor__text') == null)
    expect((await getFile('a.md'))?.content).toBe('# 远端\n')
    expect((await getFile('a.md'))?.sha).toBe('b9')
    expect(await loadDraft('a.md')).toBeUndefined()
    await waitFor(() => shadowText(c).includes('远端'))
    expect(c.textContent).toContain('已加载远端版本')
  })

  it('403：提示换读写令牌，草稿保留', async () => {
    await configure()
    vi.stubGlobal('fetch', async () => {
      return new Response(
        JSON.stringify({ message: 'Resource not accessible by personal access token' }),
        { status: 403, statusText: 'Forbidden' }
      )
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    await typeInEditor(c, '# 我的\n')

    button(c, '保存').click()
    await waitFor(() => (c.textContent ?? '').includes('写权限'))
    expect(c.querySelector('.editor__text')).not.toBeNull()
    expect(await loadDraft('a.md')).toBeDefined()
  })

  it('断网：草稿保留，提示联网后再保存', async () => {
    await configure()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    await typeInEditor(c, '# 我的\n')

    button(c, '保存').click()
    await waitFor(() => (c.textContent ?? '').includes('已存草稿'))
    expect(await loadDraft('a.md')).toBeDefined()
  })

  it('>1MB 笔记：仍显示 ✏️，点击提示文件过大且不进入编辑器', async () => {
    await saveSettings({
      token: 'ghp_test_dummy',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false,
      writeBackEnabled: true,
      autoDownloadAssets: false
    })
    await upsertFile({
      path: 'big.md',
      sha: 'sha-big',
      content: '# 大\n',
      size: 1024 * 1024 + 1,
      status: 'ok'
    })
    render(<App />, c)

    await openNote(c, 'big.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()

    await waitFor(() => (c.textContent ?? '').includes('文件过大'))
    expect(c.querySelector('.editor__text')).toBeNull()
  })

  it('改回原文后不落草稿；再改则草稿回来', async () => {
    await configure()
    vi.stubGlobal('fetch', async () => {
      throw new Error('unexpected network')
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)

    const ta = c.querySelector('.editor__text') as HTMLTextAreaElement
    ta.value = '# 改了\n'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 650))
    expect((await loadDraft('a.md'))?.content).toBe('# 改了\n')

    ta.value = '# 甲\n'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 650))
    expect(await loadDraft('a.md')).toBeUndefined()

    ta.value = '# 又改\n'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 650))
    expect((await loadDraft('a.md'))?.content).toBe('# 又改\n')
  })

  it('草稿自动保存；重开 App 后阅读器出现「未提交草稿」横幅并可继续编辑', async () => {
    await configure()
    vi.stubGlobal('fetch', async () => {
      throw new Error('unexpected network')
    })
    render(<App />, c)

    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('button[aria-label="编辑笔记"]') != null)
    ;(c.querySelector('button[aria-label="编辑笔记"]') as HTMLButtonElement).click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    await typeInEditor(c, '# 草稿\n')

    // 防抖 500ms 后落 IDB
    await new Promise((r) => setTimeout(r, 650))
    expect((await loadDraft('a.md'))?.content).toBe('# 草稿\n')

    // 模拟重开 App：卸载后重新挂载（同一 IDB）
    render(null, c)
    c = document.createElement('div')
    document.body.appendChild(c)
    render(<App />, c)

    await waitFor(() => noteButton(c, 'a.md') != null)
    expect(noteButton(c, 'a.md')?.textContent).toContain('草稿')
    await openNote(c, 'a.md')
    await waitFor(() => c.querySelector('.draft-banner') != null)
    expect(c.textContent).toContain('本机有未提交草稿')

    button(c, '继续编辑').click()
    await waitFor(() => c.querySelector('.editor__text') != null)
    expect((c.querySelector('.editor__text') as HTMLTextAreaElement).value).toBe('# 草稿\n')
  })
})
