import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { StorageUsage } from './StorageUsage'
import { upsertFile } from '../mirror/store'
import { wipeDb } from '../test/wipeDb'
import { installFakeCaches } from '../test/fakeCaches'
import { waitFor } from '../test/wait'

// 设置页「本机存储」组件：统计完成后展示五行 + 总量；某类失败时给「—」。

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

describe('StorageUsage', () => {
  beforeEach(async () => {
    await wipeDb()
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
})
