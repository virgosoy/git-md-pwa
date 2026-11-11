import { describe, it, expect } from 'vitest'
import {
  findMatchesInText,
  collectLeafTexts,
  planFind,
  applyFind,
  setCurrentMark,
  clearMarks
} from './find'

// S1(09) · 单篇查找纯函数：文本匹配 / shadow 正文叶子收集 / 高亮装配。
// 断言用已知字面量；匹配顺序按文档序；高亮用 <mark data-find>，不碰 innerHTML。

/** 建一个独立 div 宿主（模拟 .md-body 内的一小段渲染结果） */
function host(html: string): HTMLDivElement {
  const d = document.createElement('div')
  d.innerHTML = html
  return d
}

function marksOf(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll('mark[data-find]')] as HTMLElement[]
}

describe('findMatchesInText', () => {
  it('大小写不敏感：全词多处命中', () => {
    expect(findMatchesInText('Find a FIND', 'find')).toEqual([
      { start: 0, end: 4 },
      { start: 7, end: 11 }
    ])
  })

  it('CJK 子串（按码位下标）', () => {
    expect(findMatchesInText('上下快速查找中间快速', '快速')).toEqual([
      { start: 2, end: 4 },
      { start: 8, end: 10 }
    ])
  })

  it('非重叠：aa 在 aaa 里只有一处', () => {
    expect(findMatchesInText('aaa', 'aa')).toEqual([{ start: 0, end: 2 }])
  })

  it('末尾命中', () => {
    expect(findMatchesInText('abc', 'c')).toEqual([{ start: 2, end: 3 }])
  })

  it('空查询 / 无命中 → 空数组', () => {
    expect(findMatchesInText('abc', '')).toEqual([])
    expect(findMatchesInText('abc', 'xyz')).toEqual([])
  })
})

describe('collectLeafTexts', () => {
  it('正文与代码叶子可搜；mermaid 渲染的 SVG / script / style 跳过，按文档序', () => {
    const h = host(
      '<p>Hello <strong>world</strong>!</p><pre><code>const x = 1</code></pre>' +
        '<div data-mermaid><svg><text>SecretLabel</text></svg></div>' +
        '<script>bad()</script><style>.x{}</style>'
    )
    const texts = collectLeafTexts(h).map((t) => t.text)
    expect(texts).toEqual(['Hello ', 'world', '!', 'const x = 1'])
  })

  it('叶子按文档序，node 指向真实 Text 节点', () => {
    const h = host('<p>一<em>二</em>三</p><p>四</p>')
    const leaves = collectLeafTexts(h)
    expect(leaves.map((t) => t.text)).toEqual(['一', '二', '三', '四'])
    expect(leaves[0].node.nodeType).toBe(Node.TEXT_NODE)
    expect(leaves[1].node.parentElement?.tagName).toBe('EM')
  })
})

describe('planFind', () => {
  it('跨叶子按文档序展平，命中带叶子下标', () => {
    const leaves = [{ text: 'abc ABC' }, { text: 'XYZabc' }].map((l) => ({
      node: null as unknown as Text,
      ...l
    }))
    expect(planFind(leaves, 'abc')).toEqual([
      { leaf: 0, start: 0, end: 3 },
      { leaf: 0, start: 4, end: 7 },
      { leaf: 1, start: 3, end: 6 }
    ])
  })

  it('空查询 → 无命中', () => {
    expect(planFind([{ node: null as unknown as Text, text: 'abc' }], '')).toEqual([])
  })
})

describe('applyFind / setCurrentMark / clearMarks', () => {
  it('命中全部高亮，首个为当前，返回总数', () => {
    const h = host('<p>a<strong>b</strong>c b</p>')
    const n = applyFind(h, 'b')
    expect(n).toBe(2)
    const marks = marksOf(h)
    expect(marks.map((m) => m.textContent)).toEqual(['b', 'b'])
    expect(marks[0].classList.contains('is-current')).toBe(true)
    expect(marks[1].classList.contains('is-current')).toBe(false)
    expect(marks[0].classList.contains('find-hit')).toBe(true)
    // raw HTML 透传的结构不被破坏（<strong> 还在，mark 嵌进里面）
    expect(h.querySelector('strong')).toBeTruthy()
    expect(marks[0].parentElement?.tagName).toBe('STRONG')
  })

  it('同一叶子多处命中：逆序 split 坐标不失真', () => {
    const h = host('<p>找A找B找C</p>')
    const n = applyFind(h, '找')
    expect(n).toBe(3)
    expect(marksOf(h).map((m) => m.textContent)).toEqual(['找', '找', '找'])
  })

  it('改查询前先还原旧 mark，跨上次边界的命中可再匹配（normalize 合并）', () => {
    const h = host('<p>上下快速查找</p>')
    expect(applyFind(h, '快速')).toBe(1)
    expect(marksOf(h)[0].textContent).toBe('快速')
    // 「速查」跨首轮 split 的边界：clearMarks 的 normalize 必须已把文本节点拼回
    expect(applyFind(h, '速查')).toBe(1)
    expect(marksOf(h)[0].textContent).toBe('速查')
  })

  it('空查询：清高亮返回 0，无残留 mark', () => {
    const h = host('<p>ab ab</p>')
    expect(applyFind(h, 'ab')).toBe(2)
    expect(applyFind(h, '')).toBe(0)
    expect(marksOf(h)).toEqual([])
  })

  it('逃逸的 script/style 文本不被命中', () => {
    const h = host('<script>alert(1)</script><p>alert ok</p>')
    expect(applyFind(h, 'alert')).toBe(1)
    expect(marksOf(h)[0].textContent).toBe('alert')
  })

  it('Mermaid 渲染块内文字不参与命中；mermaid 关闭时的源码块可命中', () => {
    const svg = host('<div data-mermaid><svg><text>SecretLabel</text></svg></div>')
    expect(applyFind(svg, 'SecretLabel')).toBe(0)
    // mermaid 关闭：fence 按代码块渲染，无 data-mermaid 属性 → 可搜源码
    const src = host('<pre><code class="language-mermaid">graph TD;\n  A-->B</code></pre>')
    expect(applyFind(src, 'A-->B')).toBe(1)
  })

  it('表格单元格内命中', () => {
    const h = host('<table><tr><td>甲</td><td>乙丙</td></tr></table>')
    expect(applyFind(h, '乙丙')).toBe(1)
    expect(marksOf(h)[0].textContent).toBe('乙丙')
  })

  it('setCurrentMark：指定第 n 个为当前，其余取消', () => {
    const h = host('<p>xbxcxd</p>')
    applyFind(h, 'x')
    const marks = marksOf(h)
    expect(marks.length).toBe(3)
    setCurrentMark(h, 1)
    expect(marks[1].classList.contains('is-current')).toBe(true)
    expect(marks[0].classList.contains('is-current')).toBe(false)
    expect(marks[2].classList.contains('is-current')).toBe(false)
  })

  it('clearMarks：unwarp 且合并相邻文本（textContent 不变）', () => {
    const h = host('<p>前中后</p>')
    applyFind(h, '中')
    expect(marksOf(h).length).toBe(1)
    clearMarks(h)
    expect(marksOf(h)).toEqual([])
    expect(h.querySelector('p')?.textContent).toBe('前中后')
    // unwrap 后相邻文本节点已合并：单叶子可整段再匹配
    expect(applyFind(h, '前中后')).toBe(1)
  })
})
