import { describe, it, expect, afterEach, vi } from 'vitest'
import { render } from 'preact'
import type { ComponentChild } from 'preact'
import { NotesList } from './NotesList'
import type { StoredFile } from '../mirror/store'

// S2 · 全部笔记列表：分组渲染、点击打开、未镜像标记

function file(path: string, status: StoredFile['status'] = 'ok'): StoredFile {
  return { path, sha: 'x', content: '', size: 1, status }
}

function mount(vnode: ComponentChild): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  render(vnode, c)
  return c
}

const FILES: StoredFile[] = [
  file('docs/a.md'),
  file('README.md'),
  file('docs/too-big.md', 'too-large')
]

describe('NotesList', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('按顶层目录分组渲染标题与条目', () => {
    const c = mount(<NotesList files={FILES} onOpen={() => {}} />)
    const text = (c.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('docs')
    expect(text).toContain('docs/a.md')
    expect(text).toContain('根目录')
    expect(text).toContain('README.md')
  })

  it('未镜像文件带标记', () => {
    const c = mount(<NotesList files={FILES} onOpen={() => {}} />)
    expect(c.textContent).toContain('未镜像')
  })

  it('点击条目 → onOpen 收到该路径', () => {
    const opened: string[] = []
    const c = mount(<NotesList files={FILES} onOpen={(p) => opened.push(p)} />)
    const btn = [...c.querySelectorAll('button')].find((b) => b.textContent?.includes('docs/a.md'))!
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(opened).toEqual(['docs/a.md'])
  })
})
