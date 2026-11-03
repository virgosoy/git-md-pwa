import { describe, it, expect } from 'vitest'
import { classifyLink, resolveNotePath } from './links'

// S2 · 链接分类与仓库内路径解析（纯函数）

describe('classifyLink', () => {
  it('外链：http(s)/mailto/协议相对', () => {
    expect(classifyLink('https://x.com/a.png')).toBe('external')
    expect(classifyLink('http://x')).toBe('external')
    expect(classifyLink('mailto:a@b.c')).toBe('external')
    expect(classifyLink('//cdn.x/s.js')).toBe('external')
  })

  it('锚点：仅 # 开头', () => {
    expect(classifyLink('#head')).toBe('anchor')
    expect(classifyLink('')).toBe('anchor')
  })

  it('md 内链：.md / .markdown', () => {
    expect(classifyLink('./b.md')).toBe('note')
    expect(classifyLink('docs/b.markdown')).toBe('note')
  })

  it('资源：图片/pdf/文本等', () => {
    expect(classifyLink('img/logo.png')).toBe('asset')
    expect(classifyLink('files/x.pdf')).toBe('asset')
    expect(classifyLink('data.txt')).toBe('asset')
  })
})

describe('resolveNotePath', () => {
  it('同级与子目录', () => {
    expect(resolveNotePath('notes/a.md', './b.md')).toBe('notes/b.md')
    expect(resolveNotePath('notes/a.md', 'b.md')).toBe('notes/b.md')
    expect(resolveNotePath('a.md', 'x/y.md')).toBe('x/y.md')
  })

  it('上级目录与 . 折叠', () => {
    expect(resolveNotePath('notes/sub/a.md', '../b.md')).toBe('notes/b.md')
    expect(resolveNotePath('a.md', 'docs/../b.md')).toBe('b.md')
  })

  it('仓库根绝对路径（以 / 开头）', () => {
    expect(resolveNotePath('notes/a.md', '/top/c.md')).toBe('top/c.md')
  })

  it('剥离锚点与查询串再解析', () => {
    expect(resolveNotePath('notes/a.md', './b.md#sec')).toBe('notes/b.md')
    expect(resolveNotePath('notes/a.md', './b.md?raw=1')).toBe('notes/b.md')
  })

  it('decode markdown-it 的 href 转义（空格/非 ASCII 路径）', () => {
    expect(resolveNotePath('notes/a.md', 'my%20note.md')).toBe('notes/my note.md')
    expect(resolveNotePath('docs/guide.md', '%E4%B8%AD%E6%96%87.md')).toBe(
      'docs/中文.md'
    )
  })
})
