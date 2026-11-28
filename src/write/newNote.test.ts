import { describe, it, expect } from 'vitest'
import {
  buildCreateMessage,
  deriveDirectories,
  joinDirPath,
  joinNotePath,
  normalizeDirPath,
  normalizeFileName,
  resolveNoteTarget
} from './newNote'

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

describe('新建目录路径规范化', () => {
  it('单段目录名原样保留', () => {
    expect(normalizeDirPath('notes')).toEqual({ dir: 'notes', error: null })
  })

  it('多级相对路径逐段去空白', () => {
    expect(normalizeDirPath(' a / b /c ')).toEqual({ dir: 'a/b/c', error: null })
  })

  it('允许中文、内部空格与 emoji', () => {
    expect(normalizeDirPath('笔记/📁 子目录')).toEqual({
      dir: '笔记/📁 子目录',
      error: null
    })
  })

  it('拒绝空段：//、首尾 /', () => {
    expect(normalizeDirPath('a//b').error).not.toBeNull()
    expect(normalizeDirPath('/a').error).not.toBeNull()
    expect(normalizeDirPath('a/').error).not.toBeNull()
  })

  it('拒绝 . 与 .. 段', () => {
    expect(normalizeDirPath('a/./b').error).not.toBeNull()
    expect(normalizeDirPath('a/../b').error).not.toBeNull()
  })

  it('拒绝反斜杠与控制字符', () => {
    expect(normalizeDirPath('a\\b').error).not.toBeNull()
    expect(normalizeDirPath('a\u0001b').error).not.toBeNull()
  })

  it('空输入不产生目录也不报错（创建按钮据此禁用）', () => {
    expect(normalizeDirPath('   ')).toEqual({ dir: '', error: null })
  })
})

describe('新建目录路径拼接', () => {
  it('根目录直接接相对路径，子目录用 / 连接', () => {
    expect(joinDirPath('/', 'a/b')).toBe('a/b')
    expect(joinDirPath('notes', 'sub')).toBe('notes/sub')
  })

  it('相对路径为空时返回父目录', () => {
    expect(joinDirPath('notes', '')).toBe('notes')
    expect(joinDirPath('/', '')).toBe('/')
  })

  it('父目录 + 多级新目录 + 文件名 → 完整笔记 path', () => {
    expect(joinNotePath(joinDirPath('notes', 'a/b'), '首篇.md')).toBe(
      'notes/a/b/首篇.md'
    )
  })
})

describe('新建目标解析（弹层预览与 App 共用）', () => {
  it('不新建目录：父目录 + 文件名', () => {
    expect(resolveNoteTarget('notes', null, '首篇')).toEqual({
      path: 'notes/首篇.md',
      dir: 'notes',
      error: null
    })
  })

  it('新建多级目录：父目录 + 相对路径 + 文件名', () => {
    expect(resolveNoteTarget('notes', ' a /b ', '首篇')).toEqual({
      path: 'notes/a/b/首篇.md',
      dir: 'notes/a/b',
      error: null
    })
  })

  it('根目录下新建多级目录：path 不带前导 /', () => {
    expect(resolveNoteTarget('/', 'a/b', '首篇')).toEqual({
      path: 'a/b/首篇.md',
      dir: 'a/b',
      error: null
    })
  })

  it('新目录为空或非法：path/dir 为空，按需给出错误', () => {
    expect(resolveNoteTarget('notes', '  ', '首篇')).toEqual({
      path: '',
      dir: '',
      error: null
    })
    expect(resolveNoteTarget('notes', 'a//b', '首篇')).toMatchObject({
      path: '',
      dir: '',
      error: expect.stringContaining('空目录名')
    })
  })

  it('文件名为空或非法：path 为空；非法时保留已解析的 dir', () => {
    expect(resolveNoteTarget('notes', 'sub', '   ')).toEqual({
      path: '',
      dir: 'notes/sub',
      error: null
    })
    expect(resolveNoteTarget('notes', null, 'a/b')).toMatchObject({
      path: '',
      dir: 'notes',
      error: expect.stringContaining('/')
    })
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
