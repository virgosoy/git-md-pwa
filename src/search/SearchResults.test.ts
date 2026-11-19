import { describe, it, expect } from 'vitest'
import { highlightSegments } from './SearchResults'

// 展示层命中高亮：纯函数 highlightSegments 把命中的子串切段（大小写不敏感，命中全部出现处）。
// 断言用已知字面量；组件渲染不在此测（UI 接线走集成测试）。

/** 把切段结果折回字符串：命中段用 [..] 包裹，便于一眼断言命中了哪些位置 */
function flatten(text: string, query: string): string {
  return highlightSegments(text, query)
    .map((s) => (s.hit ? `[${s.text}]` : s.text))
    .join('')
}

describe('highlightSegments', () => {
  it('空查询：整段非命中，不产生 mark', () => {
    expect(highlightSegments('foo', '')).toEqual([{ text: 'foo', hit: false }])
  })

  it('无命中：返回单段非命中', () => {
    expect(highlightSegments('plain note', 'zzz')).toEqual([{ text: 'plain note', hit: false }])
  })

  it('普通命中：只包命中子串，前后原文保留，大小写不敏感', () => {
    expect(flatten('grill-me note', 'GRILL')).toBe('[grill]-me note')
  })

  it('多次命中：全部出现处都标', () => {
    expect(flatten('Grill 与 grill', 'grill')).toBe('[Grill] 与 [grill]')
  })

  it('命中在开头与末尾', () => {
    expect(flatten('acid', 'ac')).toBe('[ac]id')
    expect(flatten('acid', 'id')).toBe('ac[id]')
  })

  it('整段都命中', () => {
    expect(flatten('abc', 'abc')).toBe('[abc]')
  })

  it('重叠命中按推进游标消费：aaaa + aa → 两个 aa', () => {
    expect(flatten('aaaa', 'aa')).toBe('[aa][aa]')
  })

  it('空文本：返回空数组', () => {
    expect(highlightSegments('', 'x')).toEqual([])
  })
})
