import { describe, it, expect, afterEach, vi } from 'vitest'
import { render } from 'preact'
import type { ComponentChild } from 'preact'
import { ReaderView } from './ReaderView'

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
