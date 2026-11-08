import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render } from 'preact'
import type { ComponentChild } from 'preact'
import { ReaderView } from './ReaderView'

// 真 mermaid 只在 mermaid.smoke.test.ts 冒烟（巨型依赖，避免每个文件都 fork 一份）。
// 本文件的 renderMermaid 集成走 mock 缝：mock 渲染层，仍跑真实的 wireMermaid 装配代码。
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), parse: vi.fn(), render: vi.fn() }
}))

const mermaidMock = (await import('mermaid')).default as unknown as {
  parse: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
}

// S4 · 阅读器组件：Shadow DOM 作用域装配 + 内链/外链点击行为

const NOTE = `
# T

[跳转](other.md)
[外部](https://example.com)

\`\`\`js
const x = 1
\`\`\`

<style>.note-color{color:red}</style>
`

/** Preact 的 useEffect 在 after-paint 调度，等一帧 rAF 让 Shadow DOM 装配完成。 */
async function flush(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(() => r(null)))
}

/** 开公式时的异步路径：动态 import katex 需要多等几个任务（宏任务 + rAF）。 */
async function flushMath(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  await new Promise((r) => setTimeout(r, 0))
}

/** 等到 shadow 里出现 KaTeX 排版/错误元素（轮询，容忍冷启动 import 的分块渲染耗时）。 */
async function flushUntilKatex(container: HTMLElement): Promise<void> {
  const isDone = () => {
    const host = container.querySelector('.reader') as
      | (HTMLElement & { shadowRoot: ShadowRoot })
      | null
    return host != null && !!host.shadowRoot.querySelector('.katex, .katex-error')
  }
  for (let i = 0; i < 30 && !isDone(); i++) {
    await new Promise((r) => setTimeout(r, 10))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

/** 等到 shadow 里出现 Mermaid svg 或「渲染失败」标（07b 异步装配）。 */
async function flushUntilMermaid(container: HTMLElement): Promise<void> {
  const isDone = () => {
    const host = container.querySelector('.reader') as
      | (HTMLElement & { shadowRoot: ShadowRoot })
      | null
    return (
      host != null &&
      !!host.shadowRoot.querySelector('[data-mermaid] svg, [data-mermaid] .md-mermaid-error')
    )
  }
  for (let i = 0; i < 30 && !isDone(); i++) {
    await new Promise((r) => setTimeout(r, 10))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

function mount(vnode: ComponentChild): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  render(vnode, container)
  return container
}

function shadowOf(container: HTMLElement): ShadowRoot {
  const host = container.querySelector('.reader') as HTMLElement & { shadowRoot: ShadowRoot }
  return host.shadowRoot
}

function clickLink(container: HTMLElement, href: string): void {
  const a = shadowOf(container).querySelector(`a[href="${href}"]`) as HTMLElement
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }))
}

describe('ReaderView', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('内容渲染进 Shadow DOM：标题、代码高亮、笔记自带样式都在 shadow 内', async () => {
    const c = mount(<ReaderView path="docs/guide.md" content={NOTE} onOpenNote={() => {}} />)
    await flush()
    const root = shadowOf(c)

    expect(root.querySelector('h1')?.textContent).toBe('T')
    expect(root.querySelector('pre code')?.className).toContain('language-js')
    expect(root.querySelector('span.hljs-keyword')).toBeTruthy()

    const cssTexts = [...root.querySelectorAll('style')].map((s) => s.textContent ?? '')
    expect(cssTexts.some((t) => t.includes('.note-color{color:red}'))).toBe(true)
  })

  it('点 md 内链 → onOpenNote 收到解析后的仓库内路径', async () => {
    let opened = ''
    const c = mount(
      <ReaderView path="docs/guide.md" content={NOTE} onOpenNote={(p) => (opened = p)} />
    )
    await flush()
    clickLink(c, 'other.md')
    expect(opened).toBe('docs/other.md')
  })

  it('点外链 → 打开系统浏览器（window.open）', async () => {
    const openSpy = vi.fn(() => null)
    vi.stubGlobal('open', openSpy)

    const c = mount(<ReaderView path="docs/guide.md" content={NOTE} onOpenNote={() => {}} />)
    await flush()
    clickLink(c, 'https://example.com')

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener')
  })

  it('initialScrollTop 在装配时还原阅读位置', async () => {
    const c = mount(
      <ReaderView
        path="docs/a.md"
        content={NOTE}
        initialScrollTop={432}
        onOpenNote={() => {}}
      />
    )
    await flush()
    const host = c.querySelector('.reader') as HTMLElement
    expect(host.scrollTop).toBe(432)
  })

  it('同路径内容原地更新不重置阅读位置（防 key 之外丢失滚动）', async () => {
    const c = mount(<ReaderView path="docs/a.md" content="# v1" onOpenNote={() => {}} />)
    await flush()
    const host = c.querySelector('.reader') as HTMLElement
    host.scrollTop = 77

    render(
      <ReaderView
        path="docs/a.md"
        content={'# v2\n[跳](b.md)'}
        onOpenNote={() => {}}
      />,
      c
    )
    await flush()

    expect(host.scrollTop).toBe(77)
    expect(shadowOf(c).querySelector('h1')?.textContent).toBe('v2')
  })
})

describe('ReaderView renderMath（07a KaTeX）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('默认（关）：$…$ 字面显示，不出现 katex 元素', async () => {
    const c = mount(
      <ReaderView path="docs/a.md" content={'# T\n\n$x^2$'} onOpenNote={() => {}} />
    )
    await flushMath()
    const root = shadowOf(c)
    expect(root.querySelector('.md-body')?.textContent).toContain('$x^2$')
    expect(root.querySelector('.katex')).toBeNull()
  })

  it('开 + 含公式：异步注入 KaTeX 排版的 .katex 元素与 CSS style', async () => {
    const c = mount(
      <ReaderView
        path="docs/a.md"
        content={'# T\n\n内联 $a+b$ 公式'}
        renderMath
        onOpenNote={() => {}}
      />
    )
    await flushUntilKatex(c)
    const root = shadowOf(c)
    expect(root.querySelector('.katex')).toBeTruthy()
    expect(root.querySelector('style[data-katex]')).toBeTruthy()
    expect(root.querySelector('h1')?.textContent).toBe('T')
  })

  it('开 + 坏公式：红色 .katex-error 块出现，不崩', async () => {
    const c = mount(
      <ReaderView
        path="docs/a.md"
        content={'# T\n\n$\\frac{x+}$'}
        renderMath
        onOpenNote={() => {}}
      />
    )
    await flushUntilKatex(c)
    const root = shadowOf(c)
    expect(root.querySelector('.katex-error')).toBeTruthy()
    // 验收「红色错误块」：baseNoteCss 必须给 .katex-error 上色（块公式 katex 自带 CSS 不给颜色）
    const cssTexts = [...root.querySelectorAll('style')].map((s) => s.textContent ?? '')
    expect(cssTexts.some((t) => /\.katex-error\s*\{[^}]*color:\s*#cc0000/.test(t))).toBe(true)
  })

  it('开但正文无 $/反斜杠：跳过 katex 加载（无 katex style），仍正常渲染', async () => {
    const c = mount(
      <ReaderView
        path="docs/a.md"
        content={'# T\n\n纯文本'}
        renderMath
        onOpenNote={() => {}}
      />
    )
    await flush()
    const root = shadowOf(c)
    expect(root.querySelector('h1')?.textContent).toBe('T')
    expect(root.querySelector('style[data-katex]')).toBeNull()
  })
})

describe('ReaderView renderMermaid（07b）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    mermaidMock.parse.mockReset()
    mermaidMock.render.mockReset()
  })

  const FLOW = '# T\n\n```mermaid\ngraph TD;\n  A-->B\n```'
  const BAD = '# T\n\n```mermaid\ngraph TD;\n  [invalid\n```'

  it('默认（关）：```mermaid 显示为代码块，无 data-mermaid 宿主块', async () => {
    const c = mount(<ReaderView path="docs/a.md" content={FLOW} onOpenNote={() => {}} />)
    await flush()
    const root = shadowOf(c)
    expect(root.querySelector('pre code.language-mermaid')).toBeTruthy()
    expect(root.querySelector('.md-mermaid')).toBeNull()
    expect(mermaidMock.render).not.toHaveBeenCalled()
  })

  it('开 + 合法图：wireMermaid 装配出 svg（mock 渲染层，真渲染见冒烟）', async () => {
    mermaidMock.parse.mockResolvedValue(true)
    mermaidMock.render.mockResolvedValue({ svg: '<svg id="mock-mm"><g/></svg>' })
    const c = mount(
      <ReaderView path="docs/a.md" content={FLOW} renderMermaid onOpenNote={() => {}} />
    )
    await flushUntilMermaid(c)
    const root = shadowOf(c)
    expect(root.querySelector('[data-mermaid] svg')?.id).toBe('mock-mm')
    expect(root.querySelector('.md-mermaid-error')).toBeNull()
  })

  it('开 + 非法图：保留源码 + 「渲染失败」标，不崩', async () => {
    mermaidMock.parse.mockRejectedValue(new Error('parse err'))
    const c = mount(
      <ReaderView path="docs/a.md" content={BAD} renderMermaid onOpenNote={() => {}} />
    )
    await flushUntilMermaid(c)
    const root = shadowOf(c)
    expect(root.querySelector('.md-mermaid-error')?.textContent).toBe('渲染失败')
    expect(root.querySelector('[data-mermaid]')?.textContent).toContain('[invalid')
  })
})
