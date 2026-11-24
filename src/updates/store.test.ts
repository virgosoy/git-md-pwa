import { describe, it, expect, beforeEach } from 'vitest'
import { loadLastCheckedAt, saveLastCheckedAt } from './store'
import { wipeDb } from '../test/wipeDb'

const AT = 1_700_000_000_000

describe('updates store', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('没有记录 → null（从未检查）', async () => {
    expect(await loadLastCheckedAt()).toBeNull()
  })

  it('写入后能读回同一时间戳', async () => {
    await saveLastCheckedAt(AT)
    expect(await loadLastCheckedAt()).toBe(AT)
  })
})
