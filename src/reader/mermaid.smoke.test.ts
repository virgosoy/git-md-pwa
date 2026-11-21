import { describe, it, expect } from 'vitest'
import { wireMermaid } from './mermaid'

// 07b · 真 mermaid 冒烟（不 mock）：合法 flowchart → svg；非法 → 降级不崩。
// jsdom 缺的 SVG 测量 API 桩已放在 src/test/setup.ts（全局），这里不断言布局几何。
//
// 超时显式放宽到 15s：真 mermaid 首次加载 + jsdom 环境在 4 个并发 worker 下
// 偶发超过 vitest 默认 5s（票 17/18 记录过的 flaky，CI 会因此挡住部署）。
const REAL_MERMAID_TIMEOUT = 15000

function host(...sources: string[]): HTMLElement {
  const h = document.createElement('div')
  h.innerHTML = sources.map((s) => `<div class="md-mermaid" data-mermaid>${s}</div>`).join('')
  return h
}

describe('wireMermaid 真 mermaid（10.9.8）', () => {
  it('合法 flowchart → 宿主块内出现 svg，无错误标', async () => {
    const h = host('graph TD;\n  A-->B')
    await wireMermaid(h, { alive: () => true })
    const block = h.querySelector('[data-mermaid]') as HTMLElement
    expect(block.querySelector('svg')).toBeTruthy()
    expect(block.querySelector('.md-mermaid-error')).toBeNull()
  }, REAL_MERMAID_TIMEOUT)

  it('非法语法 → 保留源码 + 「渲染失败」标，不崩', async () => {
    const h = host('graph TD;\n  [invalid')
    await wireMermaid(h, { alive: () => true })
    const block = h.querySelector('[data-mermaid]') as HTMLElement
    expect(block.querySelector('.md-mermaid-error')?.textContent).toBe('渲染失败')
    expect(block.textContent).toContain('[invalid')
  }, REAL_MERMAID_TIMEOUT)
})
