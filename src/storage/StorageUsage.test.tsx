import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import type { ComponentProps } from 'preact'
import { StorageUsage } from './StorageUsage'
import { clearCachedAssets, loadAsset, saveAsset } from '../assets/store'
import { clearMirror, loadFiles, upsertFile } from '../mirror/store'
import { wipeDb } from '../test/wipeDb'
import { installFakeCaches } from '../test/fakeCaches'
import { waitFor } from '../test/wait'
import { button } from '../test/dom'
import { loadDraft, saveDraft } from '../write/draft'

// 清理动作的失败路径需要让 store 抛错；默认委托真实实现，其余导出保持原样。
vi.mock('../assets/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../assets/store')>()
  return { ...actual, clearCachedAssets: vi.fn(actual.clearCachedAssets) }
})
vi.mock('../mirror/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mirror/store')>()
  return { ...actual, clearMirror: vi.fn(actual.clearMirror) }
})

// 设置页「本机存储」组件：统计完成后展示分类行 + 总量；某类失败时给「—」。
// 清理资源缓存 / 清空笔记镜像：两步确认、取消不删、确认后刷新统计、失败不破坏数据。

async function seedNote(): Promise<void> {
  await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
}

function mount(props: ComponentProps<typeof StorageUsage> = {}): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  render(<StorageUsage {...props} />, c)
  return c
}

function row(c: HTMLElement, name: string): Element | undefined {
  return [...c.querySelectorAll('.storage__row')].find(
    (r) => r.querySelector('.storage__name')?.textContent === name
  )
}

function assetsCount(c: HTMLElement): string | null | undefined {
  return row(c, '图片等资源')?.querySelector('.storage__count')?.textContent
}

function notesCount(c: HTMLElement): string | null | undefined {
  return row(c, '笔记')?.querySelector('.storage__count')?.textContent
}

describe('StorageUsage', () => {
  beforeEach(async () => {
    await wipeDb()
    vi.mocked(clearCachedAssets).mockClear()
    vi.mocked(clearMirror).mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('展示总量、分类明细与开销行；无草稿时不显示草稿行', async () => {
    await seedNote()
    installFakeCaches([])
    const c = mount()
    await waitFor(() => (c.textContent ?? '').includes('共 '))

    expect(c.textContent).toContain('本机存储')
    // a.md：正文 2 B + 记录/主键 20 B = 22 B
    expect(c.textContent).toContain('共 22 B')
    expect(row(c, '笔记')?.querySelector('.storage__count')?.textContent).toBe('1 篇')
    expect(row(c, '笔记')?.querySelector('.storage__size')?.textContent).toBe('2 B')
    expect(row(c, '记录与索引开销')?.querySelector('.storage__size')?.textContent).toBe('20 B')
    expect(row(c, '草稿')).toBeUndefined()
  })

  it('有草稿时单列「草稿」行；清空镜像会提示并删除', async () => {
    await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
    await saveDraft({
      path: 'a.md',
      content: '# draft',
      baseSha: 's1',
      eol: 'lf',
      updatedAt: 1
    })
    installFakeCaches([])
    const c = mount()
    await waitFor(() => (c.textContent ?? '').includes('共 '))

    expect(row(c, '笔记')?.querySelector('.storage__size')?.textContent).toBe('2 B')
    expect(row(c, '草稿')?.querySelector('.storage__count')?.textContent).toBe('1 份')
    expect(row(c, '草稿')?.querySelector('.storage__size')?.textContent).toBe('7 B')
    // 正文 2 + 7；记录/主键 20 + 20
    expect(c.textContent).toContain('共 49 B')

    button(c, '清空笔记镜像').click()
    await waitFor(() => (c.textContent ?? '').includes('将删除本机镜像'))
    const confirmText = c.querySelector('.storage__confirm')?.textContent ?? ''
    expect(confirmText).toContain('另有 1 份未提交草稿（约 7 B）会一并删除')

    button(c, '确认清空').click()
    await waitFor(() => (c.textContent ?? '').includes('已清空'))
    expect(c.textContent).toContain('已清空本机笔记（1 篇，约 2 B，另有 1 份草稿）')
    await waitFor(() => row(c, '草稿') === undefined)
    expect(await loadDraft('a.md')).toBeUndefined()
  })

  it('某一类读取失败：该行与总量显示「—」，其余照常', async () => {
    await seedNote()
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('denied')
      }
    })
    const c = mount()
    await waitFor(() => (c.textContent ?? '').includes('部分数据读取失败'))

    expect(c.textContent).toContain('共 —')
    expect(row(c, '应用离线缓存')?.querySelector('.storage__size')?.textContent).toBe('—')
    expect(row(c, '笔记')?.querySelector('.storage__size')?.textContent).toBe('2 B')
    expect(row(c, '记录与索引开销')?.querySelector('.storage__size')?.textContent).toBe('—')
  })

  it('清理需两步确认；取消不删数据，确认后清缓存并刷新统计', async () => {
    // 'data:image/png;base64,AAAA' = 26 B/字符（全 ASCII）
    await saveAsset({
      path: 'a.png',
      dataUrl: 'data:image/png;base64,AAAA',
      size: 3,
      status: 'ok',
      savedAt: 1
    })
    installFakeCaches([])
    const c = mount()
    await waitFor(() => (c.textContent ?? '').includes('共 '))

    expect(assetsCount(c)).toBe('1 个')
    expect(button(c, '清理图片等资源缓存').disabled).toBe(false)

    button(c, '清理图片等资源缓存').click()
    await waitFor(() => (c.textContent ?? '').includes('将清除'))
    expect(c.querySelector('.storage__confirm')?.textContent).toContain(
      '将清除 1 个资源（约 26 B）'
    )

    button(c, '取消').click()
    await waitFor(() => !(c.textContent ?? '').includes('将清除'))
    expect(await loadAsset('a.png')).toBeDefined()

    button(c, '清理图片等资源缓存').click()
    await waitFor(() => (c.textContent ?? '').includes('将清除'))
    button(c, '确认清理').click()
    await waitFor(() => (c.textContent ?? '').includes('已清理'))

    expect(c.textContent).toContain('已清理 1 个资源（约 26 B）')
    await waitFor(() => assetsCount(c) === '0 个')
    expect(assetsCount(c)).toBe('0 个')
    expect(row(c, '图片等资源')?.querySelector('.storage__size')?.textContent).toBe('0 B')
    expect(await loadAsset('a.png')).toBeUndefined()
    expect(button(c, '清理图片等资源缓存').disabled).toBe(true)
  })

  it('清理失败：提示错误，数据与统计都不被清成 0', async () => {
    await saveAsset({
      path: 'a.png',
      dataUrl: 'data:image/png;base64,AAAA',
      size: 3,
      status: 'ok',
      savedAt: 1
    })
    vi.mocked(clearCachedAssets).mockRejectedValueOnce(new Error('abort'))
    installFakeCaches([])
    const c = mount()
    await waitFor(() => (c.textContent ?? '').includes('共 '))

    button(c, '清理图片等资源缓存').click()
    await waitFor(() => (c.textContent ?? '').includes('将清除'))
    button(c, '确认清理').click()
    await waitFor(() => (c.textContent ?? '').includes('清理失败'))

    expect(c.textContent).toContain('清理失败，请重试。')
    expect(assetsCount(c)).toBe('1 个')
    expect(await loadAsset('a.png')).toBeDefined()
  })

  it('清空笔记镜像需两步确认；取消不删，确认后清空并刷新统计与回调', async () => {
    await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
    await upsertFile({ path: 'b.md', sha: 's2', content: '中文', size: 6, status: 'ok' })
    installFakeCaches([])
    const onMirrorCleared = vi.fn()
    const c = mount({ onMirrorCleared })
    await waitFor(() => (c.textContent ?? '').includes('共 '))

    expect(notesCount(c)).toBe('2 篇')
    expect(button(c, '清空笔记镜像').disabled).toBe(false)

    button(c, '清空笔记镜像').click()
    await waitFor(() => (c.textContent ?? '').includes('将删除本机镜像'))
    const confirmText = c.querySelector('.storage__confirm')?.textContent ?? ''
    expect(confirmText).toContain('将删除本机镜像的 2 篇笔记')
    expect(confirmText).toContain('约 6 B')
    expect(confirmText).toContain('阅读位置')

    button(c, '取消').click()
    await waitFor(() => !(c.textContent ?? '').includes('将删除本机镜像'))
    expect(vi.mocked(clearMirror)).not.toHaveBeenCalled()
    expect(await loadFiles()).toHaveLength(2)
    expect(notesCount(c)).toBe('2 篇')

    button(c, '清空笔记镜像').click()
    await waitFor(() => (c.textContent ?? '').includes('将删除本机镜像'))
    button(c, '确认清空').click()
    await waitFor(() => (c.textContent ?? '').includes('已清空'))

    expect(c.textContent).toContain('已清空本机笔记（2 篇，约 6 B）')
    await waitFor(() => notesCount(c) === '0 篇')
    expect(notesCount(c)).toBe('0 篇')
    expect(onMirrorCleared).toHaveBeenCalledTimes(1)
    expect(await loadFiles()).toEqual([])
    expect(button(c, '清空笔记镜像').disabled).toBe(true)
  })

  it('清空笔记失败：提示错误，笔记与统计不被清成 0', async () => {
    await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
    vi.mocked(clearMirror).mockRejectedValueOnce(new Error('abort'))
    installFakeCaches([])
    const c = mount()
    await waitFor(() => (c.textContent ?? '').includes('共 '))

    button(c, '清空笔记镜像').click()
    await waitFor(() => (c.textContent ?? '').includes('将删除本机镜像'))
    button(c, '确认清空').click()
    await waitFor(() => (c.textContent ?? '').includes('清空失败'))

    expect(c.textContent).toContain('清空失败，请重试。')
    expect(notesCount(c)).toBe('1 篇')
    expect(await loadFiles()).toHaveLength(1)
  })

  it('同步进行中禁用清空笔记按钮', async () => {
    await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
    installFakeCaches([])
    const c = mount({ syncing: true })
    await waitFor(() => (c.textContent ?? '').includes('共 '))

    expect(button(c, '清空笔记镜像').disabled).toBe(true)
  })
})
