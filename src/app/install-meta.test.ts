import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// S2 · 安装元数据：Safari「加到主屏幕」后以独立窗口运行所需的 meta/link
// 抓得住：这些元数据一旦被删，测试立刻红（回归护栏）。
// 漏掉：Safari 真机上的实际呈现——那是真机验收项，不进单测。

const html = readFileSync(resolve('index.html'), 'utf8')

describe('安装元数据（主屏幕独立窗口）', () => {
  it('包含 manifest 链接、apple 独立窗口 meta、apple-touch-icon 与 theme-color', () => {
    expect(html).toContain('rel="manifest"')
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"')
    expect(html).toContain('rel="apple-touch-icon"')
    expect(html).toContain('name="theme-color"')
  })
})
