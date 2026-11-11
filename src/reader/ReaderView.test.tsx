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

describe('ReaderView 单篇 TOC（08）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const NOTE = '# 一\n\n## 二\n\n## 三\n\n正文…\n\n# 尾\n\n## 末'
  const NOTE3 = '# 一\n\n## 二\n\n## 三'

  /**
   * jsdom 无布局：给 host 与 `h1,h2` 打 getBoundingClientRect 桩，使
   * headingScrollTarget 对内容偏移 offsets 恒为目标 `offset-12`；scrollTo 更新
   * 桩读到的高度并派发 scroll 事件（配合 rAF 节流，调用方需 await 一帧）。
   */
  function stubScrollGeometry(
    container: HTMLElement,
    offsets: number[]
  ): { host: HTMLElement; scrollTo: (s: number) => void } {
    const host = container.querySelector('.reader') as HTMLElement
    const root = (host as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot
    const scrollVar = { v: 0 }
    host.getBoundingClientRect = () =>
      ({ top: 0, bottom: 500, height: 500, left: 0, right: 0, width: 300, x: 0, y: 0 } as DOMRect)
    ;[...root.querySelectorAll('h1, h2')].forEach((el, i) => {
      ;(el as HTMLElement).getBoundingClientRect = () =>
        ({ top: offsets[i] - scrollVar.v } as DOMRect)
    })
    return {
      host,
      scrollTo: (s: number): void => {
        scrollVar.v = s
        host.scrollTop = s
        host.dispatchEvent(new Event('scroll'))
      }
    }
  }

  it('≥2 标题 → 右下「目录」按钮；1 个标题 → 无按钮', async () => {
    const c = mount(<ReaderView path="a.md" content={NOTE} onOpenNote={() => {}} />)
    await flush()
    const root = shadowOf(c)
    expect(root.querySelector('.reader-toc__toggle')?.textContent).toBe('目录')

    document.body.innerHTML = ''
    const c1 = mount(<ReaderView path="b.md" content="# 只有一\n\n正文" onOpenNote={() => {}} />)
    await flush()
    expect(shadowOf(c1).querySelector('.reader-toc')).toBeNull()
  })

  it('面板：H1–H6 按层缩进、按文档序，标题被赋唯一 id', async () => {
    const c = mount(<ReaderView path="a.md" content={NOTE} onOpenNote={() => {}} />)
    await flush()
    const root = shadowOf(c)
    const toggle = root.querySelector('.reader-toc__toggle') as HTMLElement
    toggle.click()
    const panel = root.querySelector('.reader-toc__panel') as HTMLElement
    expect(panel.classList.contains('is-open')).toBe(true)

    const items = [...root.querySelectorAll('.reader-toc__item')].map((it) => ({
      text: it.textContent,
      pad: (it as HTMLElement).style.paddingLeft
    }))
    expect(items).toEqual([
      { text: '一', pad: '0.5rem' },
      { text: '二', pad: '1.4rem' },
      { text: '三', pad: '1.4rem' },
      { text: '尾', pad: '0.5rem' },
      { text: '末', pad: '1.4rem' }
    ])
    // 标题元素带唯一 id（#slug 内链直达副产物）
    const h1 = root.querySelector('h1') as HTMLElement
    const h1b = root.querySelectorAll('h1')[1] as HTMLElement
    expect(h1.getAttribute('id')).toBe('一')
    expect(h1b.getAttribute('id')).toBe('尾')
  })

  it('点条目 → 滚动定位到目标并收起面板', async () => {
    const c = mount(<ReaderView path="a.md" content={NOTE3} onOpenNote={() => {}} />)
    await flush()
    // 内容偏移 62/212/412 → 目标 scrollTop 50/200/400（offset=12）
    const { host } = stubScrollGeometry(c, [62, 212, 412])
    const root = shadowOf(c)
    const toggle = root.querySelector('.reader-toc__toggle') as HTMLElement
    toggle.click()
    const items = [...root.querySelectorAll('.reader-toc__item')] as HTMLElement[]
    items[1].click() // 「二」目标 scrollTop 200
    expect(host.scrollTop).toBe(200)
    const panel = root.querySelector('.reader-toc__panel') as HTMLElement
    expect(panel.classList.contains('is-open')).toBe(false) // 点击后收起
  })

  it('滚动：当前章节高亮随位置切换（rAF 节流后一帧生效）', async () => {
    const c = mount(<ReaderView path="a.md" content={NOTE3} onOpenNote={() => {}} />)
    await flush()
    const { scrollTo } = stubScrollGeometry(c, [62, 212, 412])
    const items = [...shadowOf(c).querySelectorAll('.reader-toc__item')] as HTMLElement[]
    const frame = (): Promise<void> =>
      new Promise<void>((r) => requestAnimationFrame(() => r()))

    scrollTo(60) // 越过「一」(50) 未到「二」(200)
    await frame()
    expect(items[0].classList.contains('is-current')).toBe(true)
    expect(items[1].classList.contains('is-current')).toBe(false)

    scrollTo(205) // 越过「二」
    await frame()
    expect(items[1].classList.contains('is-current')).toBe(true)
    expect(items[0].classList.contains('is-current')).toBe(false)
  })

  it('固定（tocPinned=true）：点条目只滚动，面板保持展开', async () => {
    const c = mount(
      <ReaderView path="a.md" content={NOTE3} tocPinned onOpenNote={() => {}} />
    )
    await flush()
    const { host } = stubScrollGeometry(c, [62, 212, 412])
    const root = shadowOf(c)
    const pin = root.querySelector('.reader-toc__pin') as HTMLElement
    expect(pin.classList.contains('is-active')).toBe(true) // 初始即固定

    ;(root.querySelector('.reader-toc__toggle') as HTMLElement).click()
    const panel = root.querySelector('.reader-toc__panel') as HTMLElement
    expect(panel.classList.contains('is-open')).toBe(true)
    const items = [...root.querySelectorAll('.reader-toc__item')] as HTMLElement[]
    items[1].click() // 「二」目标 200
    expect(host.scrollTop).toBe(200)
    expect(panel.classList.contains('is-open')).toBe(true) // 固定 → 不收起
  })

  it('固定按钮：点击即时回调 + UI 态，钉住后点条目不收起、再点可取消', async () => {
    const pinCalls: boolean[] = []
    const c = mount(
      <ReaderView
        path="a.md"
        content={NOTE3}
        onTocPinChange={(n) => pinCalls.push(n)}
        onOpenNote={() => {}}
      />
    )
    await flush()
    const { host } = stubScrollGeometry(c, [62, 212, 412])
    const root = shadowOf(c)
    const toggle = root.querySelector('.reader-toc__toggle') as HTMLElement
    const pin = root.querySelector('.reader-toc__pin') as HTMLElement
    const panel = root.querySelector('.reader-toc__panel') as HTMLElement
    toggle.click() // 打开
    expect(pin.classList.contains('is-active')).toBe(false)

    pin.click() // 固定
    expect(pinCalls).toEqual([true])
    expect(pin.classList.contains('is-active')).toBe(true)

    const items = [...root.querySelectorAll('.reader-toc__item')] as HTMLElement[]
    items[0].click()
    expect(host.scrollTop).toBe(50)
    expect(panel.classList.contains('is-open')).toBe(true) // 固定 → 不收起

    pin.click() // 取消固定
    expect(pinCalls).toEqual([true, false])
    expect(pin.classList.contains('is-active')).toBe(false)
  })
})

describe('ReaderView 单篇查找（09）', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  const NOTE = '# T\n\n正文 快速 定位。\n\n再次 快速吧。'

  function type(c: HTMLElement, value: string): void {
    const input = c.querySelector('.find-input') as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function marks(c: HTMLElement): HTMLElement[] {
    return [...shadowOf(c).querySelectorAll('mark[data-find]')] as HTMLElement[]
  }

  function countText(c: HTMLElement): string | null | undefined {
    return c.querySelector('.find-count')?.textContent
  }

  function pressKey(c: HTMLElement, key: string, shiftKey = false): void {
    const input = c.querySelector('.find-input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  }

  it('输入片段 → shadow 内高亮全部命中、计数 1/n、首个为当前', async () => {
    const c = mount(
      <ReaderView path="a.md" content={NOTE} findOpen onFindClose={() => {}} onOpenNote={() => {}} />
    )
    await flush()
    type(c, '快速')
    await flush()

    const ms = marks(c)
    expect(ms.length).toBe(2)
    expect(ms.map((m) => m.textContent)).toEqual(['快速', '快速'])
    expect(ms[0].classList.contains('is-current')).toBe(true)
    expect(ms[1].classList.contains('is-current')).toBe(false)
    expect(countText(c)).toBe('1/2')
  })

  it('↑/↓ 循环切换当前命中并更新计数；无命中时禁用按钮', async () => {
    const c = mount(
      <ReaderView path="a.md" content={NOTE} findOpen onFindClose={() => {}} onOpenNote={() => {}} />
    )
    await flush()
    type(c, '快速')
    await flush()

    const nextBtn = c.querySelector('.find-btn[aria-label="下一个"]') as HTMLButtonElement
    const prevBtn = c.querySelector('.find-btn[aria-label="上一个"]') as HTMLButtonElement

    nextBtn.click()
    await flush()
    expect(countText(c)).toBe('2/2')
    expect(marks(c)[1].classList.contains('is-current')).toBe(true)

    nextBtn.click() // 尾部 → 循环回 1
    await flush()
    expect(countText(c)).toBe('1/2')
    expect(marks(c)[0].classList.contains('is-current')).toBe(true)

    prevBtn.click() // 头部 → 循环到末尾
    await flush()
    expect(countText(c)).toBe('2/2')

    type(c, 'zzz') // 无命中
    await flush()
    expect(countText(c)).toBe('无结果')
    expect(marks(c).length).toBe(0)
    expect(nextBtn.disabled).toBe(true)
    expect(prevBtn.disabled).toBe(true)
  })

  it('回车 → 下一个，Shift+回车 → 上一个', async () => {
    const c = mount(
      <ReaderView path="a.md" content={NOTE} findOpen onFindClose={() => {}} onOpenNote={() => {}} />
    )
    await flush()
    type(c, '快速')
    await flush()

    pressKey(c, 'Enter')
    await flush()
    expect(countText(c)).toBe('2/2')

    pressKey(c, 'Enter', true)
    await flush()
    expect(countText(c)).toBe('1/2')
  })

  it('查找期间 .reader 滚动不冒泡 onScroll（阅读位置不被污染）', async () => {
    const onScroll = vi.fn()
    const c = mount(
      <ReaderView
        path="a.md"
        content={NOTE}
        findOpen
        onFindClose={() => {}}
        onScroll={onScroll}
        onOpenNote={() => {}}
      />
    )
    await flush()
    const host = c.querySelector('.reader') as HTMLElement
    host.dispatchEvent(new Event('scroll'))
    expect(onScroll).not.toHaveBeenCalled()

    // 关闭查找 → 滚动恢复冒泡给 App 保存
    render(
      <ReaderView
        path="a.md"
        content={NOTE}
        findOpen={false}
        onFindClose={() => {}}
        onScroll={onScroll}
        onOpenNote={() => {}}
      />,
      c
    )
    await flush()
    host.dispatchEvent(new Event('scroll'))
    expect(onScroll).toHaveBeenCalledTimes(1)
  })

  it('关闭查找 → 还原查找前阅读位置，清高亮、清输入、bar 消失', async () => {
    const c = mount(<ReaderView path="a.md" content={NOTE} onOpenNote={() => {}} />)
    await flush()
    const host = c.querySelector('.reader') as HTMLElement
    host.scrollTop = 300 // 读者已读到 300 才打开查找

    render(
      <ReaderView path="a.md" content={NOTE} findOpen onFindClose={() => {}} onOpenNote={() => {}} />,
      c
    )
    await flush()
    type(c, '快速')
    await flush()
    expect(marks(c).length).toBe(2)

    host.scrollTop = 120 // 查找过程滚动过

    render(
      <ReaderView
        path="a.md"
        content={NOTE}
        findOpen={false}
        onFindClose={() => {}}
        onOpenNote={() => {}}
      />,
      c
    )
    await flush()

    expect(host.scrollTop).toBe(300) // 还原 pre-find 位置
    expect(c.querySelector('.find-bar')).toBeNull()
    expect(c.querySelector('.find-input')).toBeNull()
    expect(marks(c).length).toBe(0)
  })

  it('shadow 重建（refreshToken）后查找高亮重放，不丢当前计数', async () => {
    const c = mount(
      <ReaderView path="a.md" content={NOTE} findOpen onFindClose={() => {}} onOpenNote={() => {}} />
    )
    await flush()
    type(c, '快速')
    await flush()
    expect(marks(c).length).toBe(2)

    render(
      <ReaderView
        path="a.md"
        content={NOTE}
        findOpen
        refreshToken={1}
        onFindClose={() => {}}
        onOpenNote={() => {}}
      />,
      c
    )
    await flush()
    await flush()

    expect(marks(c).length).toBe(2)
    expect(countText(c)).toBe('1/2')
  })
})
