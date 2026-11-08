import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collectMermaidBlocks, nextMermaidId, wireMermaid } from './mermaid'

// S3(07b) · Mermaid 装配：用 mock mermaid 断言唯一 id / parse 降级 / svg 注入 / 空块跳过。
// 断言全部用已知字面量；真 mermaid 行为另见 mermaid.smoke.test.ts。

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
    render: vi.fn()
  }
}))

const mermaid = (await import('mermaid')).default as unknown as {
  initialize: ReturnType<typeof vi.fn>
  parse: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

function hostWith(...sources: string[]): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = sources.map((s) => `<div class="md-mermaid" data-mermaid>${s}</div>`).join('')
  return host
}

const alive = () => true

describe('collectMermaidBlocks / nextMermaidId（纯函数）', () => {
  it('只收集 [data-mermaid] 块，保留顺序与源码文本', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <p>正文</p>
      <div class="md-mermaid" data-mermaid>graph TD; A-->B</div>
      <code class="language-mermaid">x</code>
      <div class="md-mermaid" data-mermaid>pie title T</div>
    `
    const blocks = collectMermaidBlocks(host)
    expect(blocks.length).toBe(2)
    expect(blocks[0].textContent).toContain('graph TD')
    expect(blocks[1].textContent).toContain('pie title')
  })

  it('无块/空宿主 → 空数组', () => {
    expect(collectMermaidBlocks(document.createElement('div'))).toEqual([])
  })

  it('nextMermaidId 每图唯一（撞 id 会坏 url(#id) 引用）', () => {
    const ids = new Set(Array.from({ length: 8 }, () => nextMermaidId()))
    expect(ids.size).toBe(8)
  })
})

describe('wireMermaid（mock mermaid 注入）', () => {
  beforeEach(() => {
    mermaid.initialize.mockClear()
    mermaid.parse.mockReset()
    mermaid.render.mockReset()
  })

  it('无 [data-mermaid] 块 → 不加载 mermaid（initialize 不调用）', async () => {
    await wireMermaid(document.createElement('div'), { alive })
    expect(mermaid.initialize).not.toHaveBeenCalled()
  })

  it('parse 失败 → 不打 render，块保留源码 + 「渲染失败」标', async () => {
    mermaid.parse.mockRejectedValue(new Error('parse err'))
    const host = hostWith('graph TD; [bad')
    await wireMermaid(host, { alive })
    const block = host.querySelector('[data-mermaid]') as HTMLElement
    expect(mermaid.render).not.toHaveBeenCalled()
    expect(block.querySelector('.md-mermaid-error')?.textContent).toBe('渲染失败')
    expect(block.textContent).toContain('[bad') // 源码仍在
  })

  it('render 抛错 → 同样降级（源码 + 错误标）', async () => {
    mermaid.parse.mockResolvedValue(true)
    mermaid.render.mockRejectedValue(new Error('render err'))
    const host = hostWith('graph TD; A-->B')
    await wireMermaid(host, { alive })
    const block = host.querySelector('[data-mermaid]') as HTMLElement
    expect(block.querySelector('.md-mermaid-error')).toBeTruthy()
  })

  it('render 成功 → svg 注入块内，无错误标', async () => {
    mermaid.parse.mockResolvedValue(true)
    mermaid.render.mockResolvedValue({ svg: '<svg id="md-mm-1"><g/></svg>' })
    const host = hostWith('graph TD; A-->B')
    await wireMermaid(host, { alive })
    const block = host.querySelector('[data-mermaid]') as HTMLElement
    expect(block.querySelector('svg')?.id).toBe('md-mm-1')
    expect(block.querySelector('.md-mermaid-error')).toBeNull()
  })

  it('多块渲染：id 各自唯一', async () => {
    mermaid.parse.mockResolvedValue(true)
    let n = 0
    mermaid.render.mockImplementation(async () => ({ svg: `<svg id="s${++n}"></svg>` }))
    const host = hostWith('a', 'b', 'c')
    await wireMermaid(host, { alive })
    const ids = mermaid.render.mock.calls.map((c) => c[0])
    expect(ids.length).toBe(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('空块跳过（不调 render）', async () => {
    mermaid.parse.mockResolvedValue(true)
    const host = document.createElement('div')
    host.innerHTML = '<div class="md-mermaid" data-mermaid></div>'
    await wireMermaid(host, { alive })
    expect(mermaid.render).not.toHaveBeenCalled()
  })

  it('切走中间变成 dead → 后续块不再处理', async () => {
    mermaid.parse.mockResolvedValue(true)
    let renders = 0
    mermaid.render.mockImplementation(async () => {
      renders += 1
      return { svg: `<svg id="${renders}"></svg>` }
    })
    const host = hostWith('a', 'b')
    // alive 在第一次 render 发生后才翻 false：第一块 render 后函数应该中断
    await wireMermaid(host, { alive: () => renders < 1 })
    expect(renders).toBe(1)
    expect(host.querySelectorAll('svg').length).toBe(0) // 写回被守卫拦住
  })
})
