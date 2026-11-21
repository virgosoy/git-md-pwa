import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { StorageUsage } from './StorageUsage'
import { clearCachedAssets, loadAsset, saveAsset } from '../assets/store'
import { upsertFile } from '../mirror/store'
import { wipeDb } from '../test/wipeDb'
import { installFakeCaches } from '../test/fakeCaches'
import { waitFor } from '../test/wait'

// 清理动作的失败路径需要让 store 抛错；默认委托真实实现，其余导出保持原样。
vi.mock('../assets/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../assets/store')>()
  return { ...actual, clearCachedAssets: vi.fn(actual.clearCachedAssets) }
})

// 设置页「本机存储」组件：统计完成后展示五行 + 总量；某类失败时给「—」。
// 清理资源缓存：两步确认、取消不删、确认后刷新统计、失败不破坏数据。

async function seedNote(): Promise<void> {
  await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
}

function mount(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  render(<StorageUsage />, c)
  return c
}

function row(c: HTMLElement, name: string): Element | undefined {
  return [...c.querySelectorAll('.storage__row')].find(
    (r) => r.querySelector('.storage__name')?.textContent === name
  )
}

function button(c: HTMLElement, text: string): HTMLButtonElement {
  const b = [...c.querySelectorAll('button')].find((x) => x.textContent === text)
  if (!b) throw new Error(`未找到按钮：${text}`)
  return b as HTMLButtonElement
}

function assetsCount(c: HTMLElement): string | null | undefined {
  return row(c, '图片等资源')?.querySelector('.storage__count')?.textContent
}

describe('StorageUsage', () => {
  beforeEach(async () => {
    await wipeDb()
    vi.mocked(clearCachedAssets).mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('展示总量、四类明细与开销行', async () => {
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
})
