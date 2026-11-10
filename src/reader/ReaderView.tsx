// S4 · 阅读器组件
// 每篇笔记渲染进独立 Shadow DOM（ADR-0002 的定位：笔记自带 <style> 与高亮主题
// 只作用域于本篇，不外漏污染 App UI；innerHTML 注入的 <script> 天然不执行）。
// 点击由宿主委托：md 内链 → onOpenNote(解析路径)；外链 → 系统浏览器；
// 锚点保留默认滚动；资源留给票 05。

import { useLayoutEffect, useRef } from 'preact/hooks'
import { renderNote, mayHaveMath, mayHaveMermaid, createMd } from './render'
import type { MathEngine } from './render'
import { wireMermaid } from './mermaid'
import { assignHeadingIds, headingScrollTarget, currentHeadingIndex, type TocHeading } from './toc'
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
/* 08：单篇 TOC 浮动按钮 + 面板（shadow 内作用域；fixed 视口定位，.reader 无 transform 祖先） */
.reader-toc { position: fixed; right: 1rem; bottom: 4.75rem; z-index: 20; }
.reader-toc__toggle {
  appearance: none; border: 1px solid #3f3f46; background: #27272a; color: #e4e4e7;
  border-radius: 999px; padding: 0.45rem 0.9rem; font-size: 0.85rem; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.reader-toc__toggle.is-active, .reader-toc__toggle:active { background: #3f83f8; border-color: #3f83f8; color: #fff; }
.reader-toc__panel {
  display: none; position: absolute; right: 0; bottom: calc(100% + 0.5rem); width: 15rem;
  max-height: 55vh; overflow-y: auto; background: #1f1f23; border: 1px solid #3f3f46;
  border-radius: 0.5rem; padding: 0.5rem;
}
.reader-toc__panel.is-open { display: block; }
.reader-toc__item {
  display: block; width: 100%; text-align: left; border: 0; background: none; color: #d4d4d8;
  font-size: 0.85rem; line-height: 1.4; padding: 0.25rem 0; cursor: pointer;
}
.reader-toc__item.is-current { color: #3f83f8; font-weight: 600; }
.reader-toc__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem; }
.reader-toc__title { font-size: 0.8rem; color: #a1a1aa; }
.reader-toc__pin {
  appearance: none; border: 1px solid #3f3f46; background: none; color: #a1a1aa;
  border-radius: 999px; font-size: 0.75rem; padding: 0.1rem 0.55rem; cursor: pointer;
}
.reader-toc__pin.is-active { color: #fff; background: #3f83f8; border-color: #3f83f8; }
`

/**
 * 08 · 装配浮动 TOC（按钮 + 层级面板）到 shadow（宿主内）。
 * 点击条目 → host.scrollTop 定位到标题；固定开关控制点条目后是否收起
 *（固定=保持展开，默认不固定=收起）；滚动 → 高亮当前章节。
 * 返回用于卸载（移除 scroll 监听）的函数；chrome DOM 随 shadow 内 HTML 重设自然清除。
 */
function attachTocChrome(
  shadowEl: ShadowRoot,
  hostEl: HTMLElement,
  headings: TocHeading[],
  initialPinned: boolean,
  onPinChange: (next: boolean) => void
): () => void {
  let pinned = initialPinned

  const nav = document.createElement('nav')
  nav.className = 'reader-toc__panel'
  // 面板头部：标题 + 固定开关（固定状态随设置存储，全局偏好）
  const head = document.createElement('div')
  head.className = 'reader-toc__head'
  const headTitle = document.createElement('span')
  headTitle.className = 'reader-toc__title'
  headTitle.textContent = '目录'
  const pin = document.createElement('button')
  pin.type = 'button'
  pin.className = 'reader-toc__pin'
  pin.textContent = '固定'
  const syncPin = (): void => {
    pin.classList.toggle('is-active', pinned)
    pin.setAttribute('aria-pressed', String(pinned))
  }
  syncPin()
  pin.addEventListener('click', () => {
    pinned = !pinned
    syncPin()
    onPinChange(pinned)
  })
  head.appendChild(headTitle)
  head.appendChild(pin)
  nav.appendChild(head)

  const items: HTMLButtonElement[] = []
  for (const h of headings) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'reader-toc__item'
    btn.style.paddingLeft = `${0.5 + (h.level - 1) * 0.9}rem` // 层级缩进
    btn.textContent = h.text
    btn.addEventListener('click', () => {
      hostEl.scrollTop = headingScrollTarget(hostEl, h.el)
      if (!pinned) collapse()
    })
    nav.appendChild(btn)
    items.push(btn)
  }
  const wrap = document.createElement('div')
  wrap.className = 'reader-toc'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'reader-toc__toggle'
  toggle.textContent = '目录'
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open')
    toggle.classList.toggle('is-active', open)
  })
  wrap.appendChild(toggle)
  wrap.appendChild(nav)
  shadowEl.appendChild(wrap)

  function collapse(): void {
    nav.classList.remove('is-open')
    toggle.classList.remove('is-active')
  }

  // 滚动高亮：实时按各标题目标位置定位当前章节（票 08 决策：rAF 节流，避免每帧几何重排）
  let raf = 0
  const onScroll = (): void => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      const targets = headings.map((h) => headingScrollTarget(hostEl, h.el))
      const idx = currentHeadingIndex(targets, hostEl.scrollTop)
      items.forEach((it, i) => it.classList.toggle('is-current', i === idx))
    })
  }
  hostEl.addEventListener('scroll', onScroll)
  return () => {
    hostEl.removeEventListener('scroll', onScroll)
    if (raf) cancelAnimationFrame(raf)
  }
}

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
  /** 单篇 TOC 固定偏好（08 增强）：true=点目录条目后面板保持展开；随设置全局存储 */
  tocPinned?: boolean
  /** 固定开关变化回调（由 App 持久化到 settings）；UI 即时生效 */
  onTocPinChange?: (next: boolean) => void
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
  tocPinned = false,
  onTocPinChange,
  onOpenNote,
  onScroll
}: ReaderViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<ShadowRoot | null>(null)
  const pathRef = useRef(path)
  const openRef = useRef(onOpenNote)
  const prevPathRef = useRef<string | null>(null)
  const tocPinnedRef = useRef(tocPinned)
  const onTocPinChangeRef = useRef(onTocPinChange)
  pathRef.current = path
  openRef.current = onOpenNote
  tocPinnedRef.current = tocPinned
  onTocPinChangeRef.current = onTocPinChange

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
    let detachToc = (): void => {}
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
      // 08：单篇 TOC（默认开；≥2 个标题才装配 chrome）。id 赋值对正文所有标题生效，
      // 让 `#slug` 内链可直达；pre/code 内标题被 assignHeadingIds 跳过。
      // 无条件 detach：同路径刷新（refreshToken/content）后标题数跌到 <2 也要卸掉
      // 旧 scroll 监听，否则会一直指向已断开的节点。
      detachToc()
      const toc = assignHeadingIds(mdBody)
      if (toc.length >= 2) {
        detachToc = attachTocChrome(
          shadowEl,
          hostEl,
          toc,
          tocPinnedRef.current,
          (next) => onTocPinChangeRef.current?.(next)
        )
      }
      // 只在切换新笔记时还原阅读位置；同路径内容原地更新不清滚动（防中途丢位置）
      if (isNewNote) hostEl.scrollTop = initialScrollTop
    }
    void fill()
    return () => {
      alive = false
      detachToc()
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
