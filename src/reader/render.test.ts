import { describe, it, expect } from 'vitest'
import { renderNote } from './render'

// S1 · 渲染管线：markdown-it + highlight.js + 原始 HTML 透传（ADR-0002）
// 断言全部用已知字面量（独立来源），不做快照。

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
})
