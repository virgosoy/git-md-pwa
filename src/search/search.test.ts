import { describe, it, expect } from 'vitest'
import { buildIndex, searchNotes, findBodySnippet, findAnchorIndex } from './index'

// S2 · 索引构建 + 搜索匹配：命中区分「文件」「标题（含 H1）」「正文」三态
// S3 · 正文全文搜索（票 12）：正文命中带摘录；标题命中不重复计正文；围栏内可搜
// S4 · 检索结果排序（票 14）：文件名 > 标题 > 目录 > 正文；档内 精确 > 前缀 > 包含；
//      标题档同质量 H6 > … > H1；平局兜底 path

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
          { level: 1, text: '年度总结', nth: 1 },
          { level: 2, text: '部署排障', nth: 1 },
          { level: 3, text: '缓存清理', nth: 1 }
        ],
        body: '# 年度总结\n## 部署排障\n### 缓存清理'
      },
      {
        path: 'docs/notes.md',
        headings: [{ level: 1, text: 'Notes', nth: 1 }],
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
        headingHits: [{ level: 2, text: '部署排障', nth: 1 }],
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
    expect(hits[0].headingHits).toEqual([{ level: 3, text: '缓存清理', nth: 1 }])
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
      headingHits: [{ level: 1, text: '归档总结', nth: 1 }]
    })
  })

  it('标题与正文双命中：headingHits 与 bodyMatch 并存', () => {
    const idx = buildIndex([{ path: 'a.md', content: '# 部署\n部署流程见正文' }])
    const hits = searchNotes(idx, '部署')
    expect(hits[0]).toMatchObject({
      fileMatch: false,
      headingHits: [{ level: 1, text: '部署', nth: 1 }],
      bodyMatch: true,
      bodySnippet: '部署流程见正文'
    })
  })

  it('空查询返回空数组', () => {
    expect(searchNotes(INDEX, '')).toEqual([])
    expect(searchNotes(INDEX, '   ')).toEqual([])
  })

  it('同档同质量同级别平局：按 path 兜底', () => {
    const ids = buildIndex([
      { path: 'b.md', content: '# 甲' },
      { path: 'a.md', content: '# 甲' }
    ])
    expect(searchNotes(ids, '甲').map((h) => h.path)).toEqual(['a.md', 'b.md'])
  })
})

describe('searchNotes 排序（票 14）', () => {
  const order = (files: Array<{ path: string; content: string }>, query: string) =>
    searchNotes(buildIndex(files), query).map((h) => h.path)

  it('类型主序：文件名 > 标题 > 目录 > 正文', () => {
    const files = [
      { path: '部署.md', content: '' }, // 文件名精确
      { path: 'docs/a.md', content: '# 部署' }, // 标题精确
      { path: '部署/notes.md', content: '# 其他' }, // 仅路径命中
      { path: 'docs/b.md', content: '# 其他\n正文有部署' } // 仅正文命中
    ]
    expect(order(files, '部署')).toEqual([
      '部署.md',
      'docs/a.md',
      '部署/notes.md',
      'docs/b.md'
    ])
  })

  it('文件名档内：精确 > 前缀 > 包含', () => {
    const files = [
      { path: '部署流程.md', content: '' },
      { path: '年度部署总结.md', content: '' },
      { path: '部署.md', content: '' }
    ]
    expect(order(files, '部署')).toEqual(['部署.md', '部署流程.md', '年度部署总结.md'])
  })

  it('标题档内：精确 > 前缀 > 包含', () => {
    const files = [
      { path: 'c.md', content: '# 年度部署总结' },
      { path: 'a.md', content: '# 部署' },
      { path: 'b.md', content: '# 部署流程' }
    ]
    expect(order(files, '部署')).toEqual(['a.md', 'b.md', 'c.md'])
  })

  it('标题档同质量：越深越前（H6 > … > H1）', () => {
    const files = [
      { path: 'h1.md', content: '# 部署' },
      { path: 'h6.md', content: '###### 部署' },
      { path: 'h3.md', content: '### 部署' }
    ]
    expect(order(files, '部署')).toEqual(['h6.md', 'h3.md', 'h1.md'])
  })

  it('同文件多标题命中取最优：精确优先于前缀', () => {
    const files = [
      { path: 'b.md', content: '# 部署流程说明' }, // 标题前缀
      { path: 'a.md', content: '# 部署\n## 部署流程' } // H1 精确 + H2 前缀 → 取精确
    ]
    expect(order(files, '部署')).toEqual(['a.md', 'b.md'])
  })

  it('同文件多标题命中同级取最深', () => {
    const files = [
      { path: 'a.md', content: '# 部署\n## 部署' }, // 精确中取最深 H2
      { path: 'b.md', content: '###### 部署' } // H6 精确
    ]
    expect(order(files, '部署')).toEqual(['b.md', 'a.md'])
  })

  it('目录命中排在标题命中之后（弱信号不压强命中）', () => {
    const files = [
      { path: '部署/notes.md', content: '# 其他' }, // 仅路径命中
      { path: 'x.md', content: '# 部署' } // 标题精确
    ]
    expect(order(files, '部署')).toEqual(['x.md', '部署/notes.md'])
  })

  it('文件名「包含」仍排在标题「精确」前（已接受的反转）', () => {
    const files = [
      { path: 'x.md', content: '# 部署' }, // 标题精确
      { path: '年度部署总结.md', content: '# 其他' } // 文件名包含
    ]
    expect(order(files, '部署')).toEqual(['年度部署总结.md', 'x.md'])
  })

  it('同一笔记同时命中文件名与标题：取文件名档（文件档高于标题档）', () => {
    const files = [
      { path: 'x.md', content: '# 部署' },
      { path: '部署.md', content: '# 部署' } // 文件名 + 标题双命中 → 必须走文件档
    ]
    expect(order(files, '部署')).toEqual(['部署.md', 'x.md'])
  })

  it('排序层大小写不敏感：大写文件名/标题按类型正确入档', () => {
    const files = [
      { path: 'a.md', content: '# Deploy' }, // 标题精确（小写命中大写标题）
      { path: 'DEPLOY.md', content: '# other' } // 文件名不区分大小写 → 文件档
    ]
    expect(order(files, 'deploy')).toEqual(['DEPLOY.md', 'a.md'])
  })

  it('查询串带 .md 后缀（整文件名）：仍按文件名档精确命中，不被降档', () => {
    const files = [
      { path: 'a.md', content: '# 归档.md' }, // 标题精确（标题文本含扩展名）
      { path: '归档.md', content: '# 其他' } // 文件名精确：q 剥 .md 后 === stem
    ]
    expect(order(files, '归档.md')).toEqual(['归档.md', 'a.md'])
  })

  it('目录档内平局按 path；正文档内平局按 path', () => {
    const files = [
      { path: '部署/b.md', content: '# 其他' },
      { path: '部署/a.md', content: '# 其他' },
      { path: 'd.md', content: '# x\n部署正文' },
      { path: 'c.md', content: '# y\n部署正文' }
    ]
    expect(order(files, '部署')).toEqual([
      '部署/a.md',
      '部署/b.md',
      'c.md',
      'd.md'
    ])
  })
})

describe('findAnchorIndex（票 21）', () => {
  const headings = [
    { level: 1, text: '甲' },
    { level: 2, text: '乙' },
    { level: 1, text: '甲' },
    { level: 2, text: '甲' }
  ]

  it('按 level+text 的第 nth 个定位（1 起）', () => {
    expect(findAnchorIndex(headings, { level: 1, text: '甲', nth: 1 })).toBe(0)
    expect(findAnchorIndex(headings, { level: 1, text: '甲', nth: 2 })).toBe(2)
    expect(findAnchorIndex(headings, { level: 2, text: '甲', nth: 1 })).toBe(3)
  })

  it('nth 超出或 level/text 不匹配 → -1', () => {
    expect(findAnchorIndex(headings, { level: 1, text: '甲', nth: 3 })).toBe(-1)
    expect(findAnchorIndex(headings, { level: 3, text: '甲', nth: 1 })).toBe(-1)
    expect(findAnchorIndex(headings, { level: 2, text: '丙', nth: 1 })).toBe(-1)
    expect(findAnchorIndex([], { level: 1, text: '甲', nth: 1 })).toBe(-1)
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
