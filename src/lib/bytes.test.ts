import { describe, it, expect } from 'vitest'
import { stringBytes } from './bytes'

// 字节口径：Latin-1 1 B/字符、UTF-16 2 B/字符（引擎内部表示）。

describe('stringBytes', () => {
  it('Latin-1 与 UTF-16 两种内部表示', () => {
    expect(stringBytes('abc')).toBe(3)
    expect(stringBytes('héllo')).toBe(5) // é = U+00E9 ≤ 0xFF → 一字节表示
    expect(stringBytes('中文')).toBe(4)
    expect(stringBytes('😀')).toBe(4) // 代理对两个码元 × 2
  })
})
