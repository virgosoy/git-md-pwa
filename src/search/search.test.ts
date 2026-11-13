import { describe, it, expect } from 'vitest'
import { buildIndex, searchNotes, findBodySnippet } from './index'

// S2 · 索引构建 + 搜索匹配：命中区分「文件」「标题（含 H1）」「正文」三态
// S3 · 正文全文搜索（票 12）：正文命中带摘录；标题命中不重复计正文；围栏内可搜

const FILES = [
  { path: 'docs/归档.md', content: '# 年度总结\n## 部署排障\n### 缓存清理' },
  { path: 'docs/notes.md', content: '# Notes\n正文' },
  { path: 'README.md', content: '没有标题只有文字' }
]

const INDEX = buildIndex(FILES)

describe('buildIndex', () => {
  it('建立 path→headings+body 索引', () => {
    expect(INDEX).toEqual([
      {
        path: 'docs/归档.md',
        headings: [
          { level: 1, text: '年度总结' },
          { level: 2, text: '部署排障' },
          { level: 3, text: '缓存清理' }
        ],
        body: '# 年度总结\n## 部署排障\n### 缓存清理'
      },
      {
        path: 'docs/notes.md',
        headings: [{ level: 1, text: 'Notes' }],
        body: '# Notes\n正文'
      },
      { path: 'README.md', headings: [], body: '没有标题只有文字' }
    ])
  })
})

describe('searchNotes', () => {
  it('标题命中标「标题」（H1 也算标题），带级别与文本，不含正文命中', () => {
    const hits = searchNotes(INDEX, '排障')
    expect(hits).toEqual([
      {
        path: 'docs/归档.md',
        fileMatch: false,
        headingHits: [{ level: 2, text: '部署排障' }],
        bodyMatch: false,
        bodySnippet: null
      }
    ])
  })

  it('路径命中标「文件」（fileMatch=true）', () => {
    const hits = searchNotes(INDEX, '归档')
    expect(hits[0]).toMatchObject({ path: 'docs/归档.md', fileMatch: true, headingHits: [] })
  })

  it('正文命中标 bodyMatch + 摘录（非标题、非文件名）', () => {
    const hits = searchNotes(INDEX, '只有文字')
    expect(hits).toEqual([
      {
        path: 'README.md',
        fileMatch: false,
        headingHits: [],
        bodyMatch: true,
        bodySnippet: '没有标题只有文字'
      }
    ])
  })

  it('同文件多标题命中合并为一条', () => {
    const hits = searchNotes(INDEX, '缓存')
    expect(hits).toHaveLength(1)
    expect(hits[0].headingHits).toEqual([{ level: 3, text: '缓存清理' }])
  })

  it('大小写不敏感', () => {
    expect(searchNotes(INDEX, 'notes')).toHaveLength(1)
    expect(searchNotes(INDEX, 'NOTES')).toHaveLength(1)
  })

  it('路径与标题双命中：fileMatch 与 headingHits 并存', () => {
    const idx = buildIndex([{ path: 'docs/归档.md', content: '# 归档总结\n正文' }])
    const hits = searchNotes(idx, '归档')
    expect(hits[0]).toMatchObject({
      path: 'docs/归档.md',
      fileMatch: true,
      headingHits: [{ level: 1, text: '归档总结' }]
    })
  })

  it('标题与正文双命中：headingHits 与 bodyMatch 并存', () => {
    const idx = buildIndex([{ path: 'a.md', content: '# 部署\n部署流程见正文' }])
    const hits = searchNotes(idx, '部署')
    expect(hits[0]).toMatchObject({
      fileMatch: false,
      headingHits: [{ level: 1, text: '部署' }],
      bodyMatch: true,
      bodySnippet: '部署流程见正文'
    })
  })

  it('空查询返回空数组', () => {
    expect(searchNotes(INDEX, '')).toEqual([])
    expect(searchNotes(INDEX, '   ')).toEqual([])
  })

  it('结果按路径排序', () => {
    const ids = buildIndex([
      { path: 'b.md', content: '# 甲' },
      { path: 'a.md', content: '# 甲' }
    ])
    expect(searchNotes(ids, '甲').map((h) => h.path)).toEqual(['a.md', 'b.md'])
  })
})

describe('findBodySnippet', () => {
  it('标题行不算正文，围栏标记行不算正文，代码块内算正文', () => {
    const content = [
      '# 部署排障',
      '```js',
      'const deploy = "部署"',
      '```',
      '这里讲部署流程'
    ].join('\n')
    // 标题「部署排障」含「部署」，但它是标题行 → 跳过；代码块内「部署」是正文首命中
    expect(findBodySnippet(content, '部署')).toBe('const deploy = "部署"')
  })

  it('未命中返回 null；空查询返回 null', () => {
    expect(findBodySnippet('# 标题\n正文', '不存在')).toBeNull()
    expect(findBodySnippet('# 标题\n正文', '   ')).toBeNull()
  })

  it('大小写不敏感', () => {
    expect(findBodySnippet('Hello World', 'hello')).toBe('Hello World')
  })

  it('超长正文行截断到 140 字符并加省略号', () => {
    const long = 'x'.repeat(200) + '目标'
    const snippet = findBodySnippet(long, '目标')
    expect(snippet).toBe('x'.repeat(140) + '…')
  })
})
