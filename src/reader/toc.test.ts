import { describe, it, expect } from 'vitest'
import {
  slugify,
  assignHeadingIds,
  headingScrollTarget,
  currentHeadingIndex,
  type TocHeading
} from './toc'

// S1(08) · 单篇 TOC 纯函数：slug 生成 / DOM 标题装配 / 滚动几何。
// 断言用已知字面量；jsdom 几何为零，故给元素实例打 getBoundingClientRect 桩。

describe('slugify', () => {
  it('ASCII：小写、标点折叠为单个 -、去首尾 -', () => {
    expect(slugify('My Title!', 1)).toBe('my-title')
    expect(slugify('A & B (C)', 1)).toBe('a-b-c')
  })

  it('CJK 保留（Unicode 字母），中英混排折叠分隔', () => {
    expect(slugify('第一章 概述', 1)).toBe('第一章-概述')
    expect(slugify('用 Mermaid 画图!', 1)).toBe('用-mermaid-画图')
  })

  it('空/纯符号 → 兜底 sec-N', () => {
    expect(slugify('!!!', 7)).toBe('sec-7')
    expect(slugify('   ', 3)).toBe('sec-3')
  })
})

describe('assignHeadingIds', () => {
  function host(html: string): HTMLDivElement {
    const d = document.createElement('div')
    d.innerHTML = html
    return d
  }

  it('按文档序返回 H1–H6，层级与文本正确，元素被赋 id', () => {
    const h = host('<h1>标题</h1><p>x</p><h2>小节 A</h2><h3>子节</h3>')
    const out = assignHeadingIds(h)
    expect(out.map((t) => [t.level, t.text])).toEqual([
      [1, '标题'],
      [2, '小节 A'],
      [3, '子节']
    ])
    expect(out[0].id).toBe('标题')
    expect(h.querySelector('h1')?.getAttribute('id')).toBe('标题')
  })

  it('重名标题 id 递增去重（t / t-2 / t-3）', () => {
    const h = host('<h1>T</h1><h2>T</h2><h3>T</h3>')
    const ids = assignHeadingIds(h).map((t) => t.id)
    expect(ids).toEqual(['t', 't-2', 't-3'])
  })

  it('跳过 pre/code 内的标题（raw HTML 防御），不赋 id、不入目录', () => {
    const h = host('<pre><h2>in-pre</h2></pre><code><h2>in-code</h2></code><h2>real</h2>')
    const out = assignHeadingIds(h)
    expect(out.map((t) => t.text)).toEqual(['real'])
    expect(h.querySelector('pre h2')?.getAttribute('id')).toBeNull()
  })

  it('纯符号标题（兜底 sec-N）后跟重名也不撞', () => {
    const h = host('<h2>!!!</h2><h2>sec-2</h2>')
    const ids = assignHeadingIds(h).map((t) => t.id)
    // 第一个纯符号 → sec-1；第二个 sec-2 → 与兜底区不重叠（兜底从 sec-1 起，这里正好错开）
    expect(new Set(ids).size).toBe(2)
  })

  it('返回的 el 指向被赋 id 的原元素（供滚动定位）', () => {
    const h = host('<h1>X</h1>')
    const [t] = assignHeadingIds(h) as [TocHeading]
    expect(t.el).toBe(h.querySelector('h1'))
  })
})

describe('headingScrollTarget / currentHeadingIndex', () => {
  function fakeRect(el: Element, top: number): void {
    ;(el as HTMLElement).getBoundingClientRect = () =>
      ({ top, bottom: top + 20, height: 20, left: 0, right: 0, width: 100, x: 0, y: 0 } as DOMRect)
  }

  it('目标 scrollTop = host 已滚 + 标题相对 host 顶距 - 顶部余量', () => {
    const host = document.createElement('div')
    host.scrollTop = 300
    fakeRect(host, 40) // host 顶在视口 40px
    const h = document.createElement('h1')
    fakeRect(h, 250) // 标题在视口 250px → 相对 host 顶 210
    expect(headingScrollTarget(host, h, 12)).toBe(300 + 210 - 12)
  })

  it('负目标被夹到 0', () => {
    const host = document.createElement('div')
    host.scrollTop = 0
    fakeRect(host, 0)
    const h = document.createElement('h1')
    fakeRect(h, 5) // 相对 host 顶 5，减去余量 12 → -7 → 0
    expect(headingScrollTarget(host, h, 12)).toBe(0)
  })

  it('currentHeadingIndex：取 scrollTop 已越过其目标的最后一个标题', () => {
    expect(currentHeadingIndex([50, 200, 400], 5)).toBe(-1)
    expect(currentHeadingIndex([50, 200, 400], 60)).toBe(0)
    expect(currentHeadingIndex([50, 200, 400], 201)).toBe(1)
    expect(currentHeadingIndex([50, 200, 400], 900)).toBe(2)
    expect(currentHeadingIndex([], 10)).toBe(-1)
  })
})
