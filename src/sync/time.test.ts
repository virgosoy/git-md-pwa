import { describe, it, expect } from 'vitest'
import { formatLastSync } from './time'

// S1 · 同步时间文案（纯函数，now 可注入）

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

describe('formatLastSync', () => {
  it('从未同步', () => {
    expect(formatLastSync(null, 1000)).toBe('从未同步')
    expect(formatLastSync(undefined, 1000)).toBe('从未同步')
  })

  it('一分钟内为「刚刚」', () => {
    expect(formatLastSync(Date.now() - 30_000, Date.now())).toBe('刚刚')
  })

  it('分钟级', () => {
    expect(formatLastSync(1000, 1000 + 2 * MIN)).toBe('2 分钟前')
    expect(formatLastSync(1000, 1000 + 59 * MIN)).toBe('59 分钟前')
  })

  it('小时级', () => {
    expect(formatLastSync(1000, 1000 + 2 * HOUR)).toBe('2 小时前')
  })

  it('天级', () => {
    expect(formatLastSync(1000, 1000 + 3 * DAY)).toBe('3 天前')
    expect(formatLastSync(1000, 1000 + 26 * HOUR)).toBe('1 天前')
  })
})
