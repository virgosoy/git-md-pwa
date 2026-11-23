import { describe, it, expect, afterEach } from 'vitest'
import {
  slugify,
  assignHeadingIds,
  headingScrollTarget,
  isHeadingRendered,
  filterHeadings,
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

describe('filterHeadings', () => {
  // 用 assignHeadingIds 从真实 DOM 构造目录条目（含 el 引用，贴近生产路径）
  function tocOf(html: string): TocHeading[] {
    const d = document.createElement('div')
    d.innerHTML = html
    return assignHeadingIds(d)
  }

  it('空/纯空白查询返回原列表（不筛选）', () => {
    const toc = tocOf('<h1>甲</h1><h2>乙</h2>')
    expect(filterHeadings(toc, '')).toBe(toc)
    expect(filterHeadings(toc, '   ')).toBe(toc)
  })

  it('大小写不敏感子串命中', () => {
    const toc = tocOf('<h1>Alpha Core</h1><h2>beta</h2>')
    expect(filterHeadings(toc, 'alpha').map((h) => h.text)).toEqual(['Alpha Core'])
    expect(filterHeadings(toc, 'CORE').map((h) => h.text)).toEqual(['Alpha Core'])
    expect(filterHeadings(toc, 'BETA').map((h) => h.text)).toEqual(['beta'])
  })

  it('扁平过滤：父标题命中不连带未命中的子标题', () => {
    const toc = tocOf('<h1>甲</h1><h2>乙</h2><h3>丙</h3>')
    expect(filterHeadings(toc, '甲').map((h) => h.text)).toEqual(['甲'])
  })

  it('无命中返回空数组', () => {
    const toc = tocOf('<h1>甲</h1><h2>乙</h2>')
    expect(filterHeadings(toc, '不存在')).toEqual([])
  })

  it('过滤结果保留每条 level 与原 el 引用（供点击跳转/层级缩进）', () => {
    const toc = tocOf('<h1>X</h1><h2>Y</h2><h2>Z</h2>')
    const out = filterHeadings(toc, 'z')
    expect(out).toHaveLength(1)
    expect([out[0].level, out[0].text]).toEqual([2, 'Z'])
    expect(out[0].el).toBe(toc[2].el)
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

  it('亚像素：点击跳转后重算 target = scrollTop + ε，仍判为被点标题（不是上一个）', () => {
    // scrollTop 200 = 刚点中目标 200 的标题；重算后 target 因亚像素取整变 200.4
    expect(currentHeadingIndex([50, 200.4], 200)).toBe(1)
    expect(currentHeadingIndex([50, 200.99], 200)).toBe(1)
    // 不提前：还差 1px 才到目标 200 时，不越级高亮
    expect(currentHeadingIndex([50, 200], 199)).toBe(0)
  })
})

// 21 追加 · 文本匹配到但标题没有布局盒子（被未闭合 <dialog> 等原始 HTML 吞掉）时，
// 不能按几何跳转（会拿零几何算出一个随阅读位置变化的假落点）。
describe('isHeadingRendered（票 21 追加）', () => {
  const docEl = document.documentElement as HTMLElement & {
    getClientRects: () => DOMRectList
  }
  const origDocRects = docEl.getClientRects

  afterEach(() => {
    docEl.getClientRects = origDocRects
    document.body.innerHTML = ''
  })

  it('有布局环境：标题无盒子 → false；有盒子 → true', () => {
    docEl.getClientRects = () => [{} as DOMRect] as unknown as DOMRectList
    const h = document.createElement('h2')
    h.getClientRects = () => [] as unknown as DOMRectList
    expect(isHeadingRendered(h)).toBe(false)

    h.getClientRects = () => [{} as DOMRect] as unknown as DOMRectList
    expect(isHeadingRendered(h)).toBe(true)
  })

  it('无布局环境（jsdom 默认）：不能据判，按可见处理', () => {
    const h = document.createElement('h2')
    // jsdom 的 getClientRects 恒空，若据判会把所有标题误判成不可见
    expect(isHeadingRendered(h)).toBe(true)
  })
})
