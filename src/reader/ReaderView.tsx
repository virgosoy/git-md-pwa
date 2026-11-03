// S4 · 阅读器组件
// 每篇笔记渲染进独立 Shadow DOM（ADR-0002 的定位：笔记自带 <style> 与高亮主题
// 只作用域于本篇，不外漏污染 App UI；innerHTML 注入的 <script> 天然不执行）。
// 点击由宿主委托：md 内链 → onOpenNote(解析路径)；外链 → 系统浏览器；
// 锚点保留默认滚动；资源留给票 05。

import { useLayoutEffect, useRef } from 'preact/hooks'
import { renderNote } from './render'
import { classifyLink, resolveNotePath } from './links'
import highlightCss from 'highlight.js/styles/github-dark.css?raw'

// 注入 shadow 的笔记基础排版（浏览器 UA 样式在 shadow 里很简陋）
const baseNoteCss = `
.md-body {
  padding: 0 1rem 3rem;
  line-height: 1.7;
  font-size: 1rem;
  overflow-wrap: break-word;
}
.md-body pre { background: #0b0b0e; padding: 0.9rem; border-radius: 0.5rem; overflow-x: auto; }
.md-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.md-body a { color: #3f83f8; }
.md-body img { max-width: 100%; }
.md-body table { border-collapse: collapse; }
.md-body th, .md-body td { border: 1px solid #3f3f46; padding: 0.35rem 0.6rem; }
.md-body blockquote { border-left: 3px solid #3f3f46; margin: 0; padding-left: 0.8rem; color: #a1a1aa; }
`

export interface ReaderViewProps {
  path: string
  content: string
  /** 装配时还原的阅读位置（打开时从阅读存储读取） */
  initialScrollTop?: number
  onOpenNote: (targetPath: string) => void
  onScroll?: (scrollTop: number) => void
}

export function ReaderView({
  path,
  content,
  initialScrollTop = 0,
  onOpenNote,
  onScroll
}: ReaderViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<ShadowRoot | null>(null)
  const pathRef = useRef(path)
  const openRef = useRef(onOpenNote)
  const prevPathRef = useRef<string | null>(null)
  pathRef.current = path
  openRef.current = onOpenNote

  // useLayoutEffect：装配 Shadow DOM 是挂载时就要完成的 DOM 操作，不同步会闪空。
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    let root = rootRef.current
    if (!root) {
      root = host.attachShadow({ mode: 'open' })
      rootRef.current = root
      root.addEventListener('click', (e) => {
        const a = (e.target as Element | null)?.closest?.('a')
        if (!a) return
        const href = a.getAttribute('href')
        if (!href) return
        const kind = classifyLink(href)
        if (kind === 'note') {
          e.preventDefault()
          openRef.current(resolveNotePath(pathRef.current, href))
        } else if (kind === 'external') {
          e.preventDefault()
          if (typeof window !== 'undefined' && window.open) {
            window.open(href, a.getAttribute('target') ?? '_blank', 'noopener')
          }
        }
        // anchor：默认滚动；asset：票 05 懒加载
      })
    }
    const isNewNote = prevPathRef.current !== path
    prevPathRef.current = path
    root.innerHTML = `<style>${baseNoteCss}</style><style>${highlightCss}</style><div class="md-body">${renderNote(content)}</div>`
    // 只在切换新笔记时还原阅读位置；同路径内容原地更新不清滚动（防中途丢位置）
    if (isNewNote) host.scrollTop = initialScrollTop
  }, [path, content, initialScrollTop])

  return (
    <div
      class="reader"
      ref={hostRef}
      onScroll={
        onScroll ? (e) => onScroll((e.currentTarget as HTMLElement).scrollTop) : undefined
      }
    ></div>
  )
}
