import { describe, it, expect } from 'vitest'
import { groupNotesByTopDir } from './group'

// S1 · 笔记按顶层目录分组（纯函数）

describe('groupNotesByTopDir', () => {
  it('按顶层目录分组并保持路径排序', () => {
    const groups = groupNotesByTopDir([
      'docs/b.md',
      'README.md',
      'docs/a.md',
      '.claude/commands/x.md',
      'assets/logo.md',
      'docs/sub/c.md'
    ])
    expect(groups.map((g) => g.dir)).toEqual(['.claude', 'assets', 'docs', '/'])
    const docs = groups.find((g) => g.dir === 'docs')!
    expect(docs.files).toEqual(['docs/a.md', 'docs/b.md', 'docs/sub/c.md'])
  })

  it('根目录文件归入 /', () => {
    const groups = groupNotesByTopDir(['README.md', 'CONTRIBUTING.md'])
    expect(groups).toEqual([{ dir: '/', files: ['CONTRIBUTING.md', 'README.md'] }])
  })

  it('空列表返回空', () => {
    expect(groupNotesByTopDir([])).toEqual([])
  })
})
