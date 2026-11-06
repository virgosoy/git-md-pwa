import { describe, it, expect } from 'vitest'
import { buildIndex, searchHeadings } from './index'

// S2 · 索引构建 + 搜索匹配：命中要区分「文件」还是「标题」（含 H1）

const FILES = [
  { path: 'docs/归档.md', content: '# 年度总结\n## 部署排障\n### 缓存清理' },
  { path: 'docs/notes.md', content: '# Notes\n正文' },
  { path: 'README.md', content: '没有标题只有文字' }
]

const INDEX = buildIndex(FILES)

describe('buildIndex', () => {
  it('建立 path→headings 索引', () => {
    expect(INDEX).toEqual([
      {
        path: 'docs/归档.md',
        headings: [
          { level: 1, text: '年度总结' },
          { level: 2, text: '部署排障' },
          { level: 3, text: '缓存清理' }
        ]
      },
      { path: 'docs/notes.md', headings: [{ level: 1, text: 'Notes' }] },
      { path: 'README.md', headings: [] }
    ])
  })
})

describe('searchHeadings', () => {
  it('标题命中标「标题」（H1 也算标题），带级别与文本', () => {
    const hits = searchHeadings(INDEX, '排障')
    expect(hits).toEqual([
      { path: 'docs/归档.md', fileMatch: false, headingHits: [{ level: 2, text: '部署排障' }] }
    ])
  })

  it('路径命中标「文件」（fileMatch=true）', () => {
    const hits = searchHeadings(INDEX, '归档')
    expect(hits[0]).toMatchObject({ path: 'docs/归档.md', fileMatch: true, headingHits: [] })
  })

  it('同文件多标题命中合并为一条', () => {
    const hits = searchHeadings(INDEX, '缓存')
    expect(hits).toHaveLength(1)
    expect(hits[0].headingHits).toEqual([{ level: 3, text: '缓存清理' }])
  })

  it('大小写不敏感', () => {
    expect(searchHeadings(INDEX, 'notes')).toHaveLength(1)
    expect(searchHeadings(INDEX, 'NOTES')).toHaveLength(1)
  })

  it('路径与标题双命中：fileMatch 与 headingHits 并存', () => {
    const idx = buildIndex([{ path: 'docs/归档.md', content: '# 归档总结\n正文' }])
    const hits = searchHeadings(idx, '归档')
    expect(hits[0]).toMatchObject({
      path: 'docs/归档.md',
      fileMatch: true,
      headingHits: [{ level: 1, text: '归档总结' }]
    })
  })

  it('空查询返回空数组', () => {
    expect(searchHeadings(INDEX, '')).toEqual([])
    expect(searchHeadings(INDEX, '   ')).toEqual([])
  })

  it('结果按路径排序', () => {
    const ids = buildIndex([
      { path: 'b.md', content: '# 甲' },
      { path: 'a.md', content: '# 甲' }
    ])
    expect(searchHeadings(ids, '甲').map((h) => h.path)).toEqual(['a.md', 'b.md'])
  })
})
