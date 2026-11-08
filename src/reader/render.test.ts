import { describe, it, expect } from 'vitest'
import type { MarkdownIt } from 'markdown-it'
import { renderNote, createMd, mayHaveMath } from './render'
import type { MathEngine } from './render'
import { loadMathEngine } from './math'

// S1 · 渲染管线：markdown-it + highlight.js + 原始 HTML 透传（ADR-0002）
// S2(07a) · createMd(engine?) 工厂：无引擎保持旧行为；注入 KaTeX 引擎后按定界符渲染。
// 断言全部用已知字面量（独立来源），不做快照；数据全哑值。

const NOTE = `
# 标题

| a | b |
|---|---|
| 1 | 2 |

\`\`\`js
const x = 1
\`\`\`

<style>.note-color { color: red; }</style>

<script>alert(1)</script>
`

function engineOnce() {
  let p: Promise<MathEngine> | null = null
  return () => (p ??= loadMathEngine())
}

const mathEngine = engineOnce()

describe('renderNote', () => {
  it('渲染标题与表格', () => {
    const html = renderNote(NOTE)
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('代码块高亮：注入 language 类与 hljs token', () => {
    const html = renderNote(NOTE)
    expect(html).toMatch(/<pre[^>]*><code[^>]*class="language-js"/)
    expect(html).toContain('<span class="hljs-')
  })

  it('原始 HTML（<style>、<script>）原文透传而非转义', () => {
    const html = renderNote(NOTE)
    expect(html).toContain('<style>.note-color { color: red; }</style>')
    expect(html).not.toContain('&lt;style')
    expect(html).toContain('<script>alert(1)</script>')
  })

  it('不开公式：$…$ 按字面文本渲染', () => {
    const html = renderNote('内联 $x^2$ 维持字面')
    expect(html).toContain('$x^2$')
    expect(html).not.toContain('class="katex"')
  })
})

describe('createMd(engine?)', () => {
  it('不注入引擎时与 renderNote 行为一致（$ 字面）', () => {
    const render = createMd()
    expect(render('$x^2$ 照旧')).toBe(renderNote('$x^2$ 照旧'))
  })

  it('注入 KaTeX 引擎：$$…$$ 块渲染为排版公式', async () => {
    const render = createMd(await mathEngine())
    const html = render('$$x^2$$')
    expect(html).toContain('<p class="katex-block">')
    expect(html).toContain('class="katex-display"')
  })

  it('注入 KaTeX 引擎：$…$ 行内渲染', async () => {
    const render = createMd(await mathEngine())
    const html = render('内联 $a+b$ 结束')
    expect(html).toContain('<span class="katex">')
  })

  it('注入 KaTeX 引擎：裸 \\begin{aligned}…\\end{aligned} 环境渲染为块公式', async () => {
    const render = createMd(await mathEngine())
    const html = render('\\begin{aligned}x\\end{aligned}')
    expect(html).toContain('<p class="katex-block">')
    expect(html).toContain('class="katex-display"')
  })

  it('注入 KaTeX 引擎：\\$ 转义与货币 $ 不被误伤', async () => {
    const render = createMd(await mathEngine())
    const html = render('cost \\$5 和 $10 元，$5/个')
    expect(html).toContain('cost $5')
    expect(html).toContain('$10 元')
    expect(html).toContain('$5/个')
    expect(html).not.toContain('class="katex"')
  })

  it('注入 KaTeX 引擎：语法错误输出 .katex-error 块且保留源码，不崩', async () => {
    const render = createMd(await mathEngine())
    const html = render('$\\frac{x+}$')
    expect(html).toContain('katex-error')
    expect(html).toContain('\\frac{x+}')
  })

  it('注入 KaTeX 引擎：未闭合的单个 $ 维持字面（静默当源码）', async () => {
    const render = createMd(await mathEngine())
    const html = render('示例 $x^2 没有闭合')
    expect(html).toContain('$x^2 没有闭合')
  })

  it('engine.attach 每个工厂实例只调用一次（同一 md 复用）', () => {
    let calls = 0
    const stub: MathEngine = {
      attach(_md: MarkdownIt) {
        calls += 1
      }
    }
    const render = createMd(stub)
    render('# a')
    render('# b')
    expect(calls).toBe(1)
  })
})

describe('mayHaveMath 预检', () => {
  it('无 $ 与反斜杠 → false（可跳过按需 import）', () => {
    expect(mayHaveMath('纯文本笔记')).toBe(false)
  })
  it('含 $ 或反斜杠 → true', () => {
    expect(mayHaveMath('有 $x$ 公式')).toBe(true)
    expect(mayHaveMath('有 \\begin{aligned}')).toBe(true)
  })
})
