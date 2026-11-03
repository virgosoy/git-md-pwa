import { describe, it, expect, beforeEach } from 'vitest'
import { recordOpen, saveScroll, loadReading, listRecent } from './reading'
import { wipeDb } from '../test/wipeDb'

// S3 · 阅读/最近存储（reading 表：scrollTop 持久化 + openedAt 时序）
// 测试数据一律哑值。

const tick = () => new Promise((r) => setTimeout(r, 3))

describe('阅读/最近存储', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('滚动位置可保存并读回；未读为 undefined', async () => {
    expect(await loadReading('a.md')).toBeUndefined()
    await saveScroll('a.md', 1234)
    expect((await loadReading('a.md'))?.scrollTop).toBe(1234)
  })

  it('recordOpen 按打开时间倒序出最近列表', async () => {
    await recordOpen('a.md')
    await tick()
    await recordOpen('b.md')
    await tick()
    await recordOpen('c.md')
    const recent = await listRecent()
    expect(recent.map((r) => r.path)).toEqual(['c.md', 'b.md', 'a.md'])
  })

  it('再次打开已读笔记回到最近首位', async () => {
    await recordOpen('a.md')
    await tick()
    await recordOpen('b.md')
    await tick()
    await recordOpen('a.md')
    const recent = await listRecent()
    expect(recent.map((r) => r.path)).toEqual(['a.md', 'b.md'])
  })

  it('listRecent 截断到 limit', async () => {
    await recordOpen('a.md')
    await tick()
    await recordOpen('b.md')
    await tick()
    await recordOpen('c.md')
    expect((await listRecent(2)).map((r) => r.path)).toEqual(['c.md', 'b.md'])
  })

  it('saveScroll 保留原打开时间，只更新位置', async () => {
    await recordOpen('a.md')
    const before = await loadReading('a.md')
    await tick()
    await saveScroll('a.md', 999)
    const after = await loadReading('a.md')
    expect(after?.scrollTop).toBe(999)
    expect(after?.openedAt).toBe(before?.openedAt)
  })
})
