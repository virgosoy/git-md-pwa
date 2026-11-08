// S4 · 阅读器组件
// 每篇笔记渲染进独立 Shadow DOM（ADR-0002 的定位：笔记自带 <style> 与高亮主题
// 只作用域于本篇，不外漏污染 App UI；innerHTML 注入的 <script> 天然不执行）。
// 点击由宿主委托：md 内链 → onOpenNote(解析路径)；外链 → 系统浏览器；
// 锚点保留默认滚动；资源留给票 05。

import { useLayoutEffect, useRef } from 'preact/hooks'
import { renderNote, mayHaveMath, mayHaveMermaid, createMd } from './render'
import type { MathEngine } from './render'
import { wireMermaid } from './mermaid'
import { classifyLink, resolveNotePath } from './links'
import { wireAssets } from '../assets/wire'
import type { AssetLoader } from '../assets/wire'
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
.md-body a.is-missing { color: #a1a1aa; text-decoration: none; }
.md-body a.is-missing::after { content: "（未镜像）"; color: #a1a1aa; font-size: 0.8em; }
.md-body img { max-width: 100%; }
.md-body table { border-collapse: collapse; }
.md-body th, .md-body td { border: 1px solid #3f3f46; padding: 0.35rem 0.6rem; }
.md-body blockquote { border-left: 3px solid #3f3f46; margin: 0; padding-left: 0.8rem; color: #a1a1aa; }
.md-body .katex-error {
  /* 07a：公式语法错误的降级红块（katex CSS 未定义 .katex-error 颜色，行内/块公式都要可见） */
  color: #cc0000;
  background: rgba(204, 0, 0, 0.06);
  padding: 0.2em 0.4em;
  border-radius: 0.25em;
}
.md-body .md-mermaid { margin: 1rem 0; overflow-x: auto; }
.md-body .md-mermaid svg { max-width: 100%; height: auto; }
.md-body .md-mermaid-error { color: #cc0000; font-size: 0.85em; margin: 0.25rem 0 0; }
`

export interface ReaderViewProps {
  path: string
  content: string
  /** 装配时还原的阅读位置（打开时从阅读存储读取） */
  initialScrollTop?: number
  /** 资源加载器（图/PDF 懒加载）；不传则跳过资源装配 */
  assetLoader?: AssetLoader | null
  /** 变化时触发重新装配（如「本篇资源全下」后让已缓存资源回填） */
  refreshToken?: number
  /** 渲染数学公式（KaTeX，07a）；关/无公式正文→零依赖按需加载 */
  renderMath?: boolean
  /** 渲染 Mermaid 图表（07b）；关/无围栏→```mermaid 当普通代码块 */
  renderMermaid?: boolean
  onOpenNote: (targetPath: string) => void
  onScroll?: (scrollTop: number) => void
}

export function ReaderView({
  path,
  content,
  initialScrollTop = 0,
  assetLoader,
  refreshToken = 0,
  renderMath = false,
  renderMermaid = false,
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
    const hostEl = host
    let root = rootRef.current
    if (!root) {
      root = hostEl.attachShadow({ mode: 'open' })
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
    const shadowEl = root
    const isNewNote = prevPathRef.current !== path
    prevPathRef.current = path
    // 骨架（基础排版 + 高亮 + 容器）先同步落位；正文内容由 fill 填充。
    // 07a：开公式时才动态 import('./math') 拿引擎与 KaTeX CSS，避免主包常驻 katex。
    shadowEl.innerHTML = `<style>${baseNoteCss}</style><style>${highlightCss}</style><div class="md-body"></div>`
    shadowEl.querySelectorAll('style[data-katex]').forEach((s) => s.remove())
    const mdBody = shadowEl.querySelector('.md-body') as HTMLDivElement

    let alive = true
    async function fill(): Promise<void> {
      // 07a：开公式才动态 import math（引擎 + KaTeX CSS），失败则 engine 保持空转无公式。
      let engine: MathEngine | undefined
      try {
        if (renderMath && mayHaveMath(content)) {
          const mod = await import('./math')
          if (!alive || pathRef.current !== path) return
          engine = await mod.loadMathEngine()
          if (!alive || pathRef.current !== path) return
          // KaTeX CSS 注入 shadow（字体 URL 已由 Vite 重写为产物资产路径）
          const katexStyle = document.createElement('style')
          katexStyle.setAttribute('data-katex', '')
          katexStyle.textContent = mod.KATEX_CSS
          shadowEl.appendChild(katexStyle)
        }
      } catch {
        // 数学按需分块加载失败：本次退化为无公式渲染（不白屏不崩）
      }
      let html: string
      try {
        html = createMd({ math: engine, mermaid: renderMermaid })(content)
      } catch {
        html = renderNote(content)
      }
      if (!alive || pathRef.current !== path) return
      mdBody.innerHTML = html
      if (assetLoader) void wireAssets(shadowEl, path, assetLoader)
      // 07b：Mermaid 装配（异步按需加载；alive+pathRef 守卫，切走不写回旧图）
      if (renderMermaid && mayHaveMermaid(content)) {
        void wireMermaid(mdBody, { alive: () => alive && pathRef.current === path })
      }
      // 只在切换新笔记时还原阅读位置；同路径内容原地更新不清滚动（防中途丢位置）
      if (isNewNote) hostEl.scrollTop = initialScrollTop
    }
    void fill()
    return () => {
      alive = false
    }
  }, [path, content, initialScrollTop, assetLoader, refreshToken, renderMath, renderMermaid])

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
