import { describe, it, expect } from 'vitest'
import { buildCreateMessage, deriveDirectories, joinNotePath, normalizeFileName } from './newNote'

describe('文件名规范化', () => {
  it('不以 .md 结尾时自动补上', () => {
    expect(normalizeFileName('我的笔记')).toEqual({ name: '我的笔记.md', error: null })
  })

  it('已是 .md / .MD 不重复补', () => {
    expect(normalizeFileName('a.md')).toEqual({ name: 'a.md', error: null })
    expect(normalizeFileName('a.MD')).toEqual({ name: 'a.MD', error: null })
  })

  it('去除首尾空白，保留内部空格与大小写', () => {
    expect(normalizeFileName('  My Note  ')).toEqual({ name: 'My Note.md', error: null })
  })

  it('允许中文与 emoji', () => {
    expect(normalizeFileName('📝 记录')).toEqual({ name: '📝 记录.md', error: null })
  })

  it('拒绝路径分隔符 / 与 \\', () => {
    expect(normalizeFileName('a/b').error).not.toBeNull()
    expect(normalizeFileName('a\\b').error).not.toBeNull()
  })

  it('拒绝控制字符 U+0000–U+001F 与 U+007F', () => {
    expect(normalizeFileName('a\u0001b').error).not.toBeNull()
    expect(normalizeFileName('a\u007Fb').error).not.toBeNull()
  })

  it('拒绝整名等于 . 或 ..', () => {
    expect(normalizeFileName('.').error).not.toBeNull()
    expect(normalizeFileName('..').error).not.toBeNull()
  })

  it('空名不产生文件名也不报错（创建按钮据此禁用）', () => {
    expect(normalizeFileName('   ')).toEqual({ name: '', error: null })
  })
})

describe('目录列表推导', () => {
  it('根目录固定首项；从文件路径去文件名，含嵌套父目录且去重排序', () => {
    expect(
      deriveDirectories([
        { path: 'a.md' },
        { path: 'notes/b.md' },
        { path: 'notes/sub/c.md' },
        { path: 'notes/sub/d.md' }
      ])
    ).toEqual(['/', 'notes', 'notes/sub'])
  })

  it('没有子目录时只有根目录', () => {
    expect(deriveDirectories([{ path: 'a.md' }])).toEqual(['/'])
  })
})

describe('路径拼接', () => {
  it('根目录直接接文件名，子目录用 / 连接', () => {
    expect(joinNotePath('/', 'a.md')).toBe('a.md')
    expect(joinNotePath('notes', 'a.md')).toBe('notes/a.md')
    expect(joinNotePath('notes/sub', 'a.md')).toBe('notes/sub/a.md')
  })
})

describe('新建提交说明', () => {
  it('固定为「手机新建：<path>」', () => {
    expect(buildCreateMessage('notes/哑值.md')).toBe('手机新建：notes/哑值.md')
  })
})
