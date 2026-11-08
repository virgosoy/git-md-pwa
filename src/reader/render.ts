// S1 · 渲染管线
// markdown-it（CommonMark + 表格）+ highlight.js 代码高亮。
// 原始 HTML 透传（ADR-0002）：<style> 等保留原文，供 Shadow DOM 作用域复用；
// 由 innerHTML 注入的 <script> 天然不执行，无需额外净化。
// 07a · createMd(opts) 工厂：可注入公式引擎（math，07a）与是否开启 Mermaid 围栏
// 宿主块（mermaid，07b）；无 options 时行为与 renderNote 完全一致。
// 引擎/运行时依赖由 math.ts / mermaid.ts 按需构建，本模块不静态依赖 katex/mermaid。

import MarkdownIt from 'markdown-it'
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it'
import hljs from 'highlight.js'

/** 可注入的公式引擎：把公式插件挂到 markdown-it 实例（关=不注入） */
export interface MathEngine {
  attach(md: MarkdownItInstance): void
}

/** 渲染工厂可选项：math=公式引擎（07a）；mermaid=```mermaid 围栏转宿主块（07b） */
export interface RenderOptions {
  math?: MathEngine
  mermaid?: boolean
}

function configureHighlight(md: MarkdownItInstance): void {
  md.options.highlight = (code, rawLang) => {
    const lang = (rawLang || '').trim().toLowerCase()
    let highlighted: string
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(code, { language: lang }).value
    } else if (lang) {
      // 未知语言：保留 language 类但转义，避免注入
      highlighted = md.utils.escapeHtml(code)
    } else {
      highlighted = hljs.highlightAuto(code).value
    }
    const cls = lang ? ` class="language-${md.utils.escapeHtml(lang)}"` : ''
    return `<pre class="hljs"><code${cls}>${highlighted}</code></pre>`
  }
}

function configureMermaid(md: MarkdownItInstance): void {
  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if ((token.info || '').trim().toLowerCase() === 'mermaid') {
      // 07b：不带 hljs 的宿主块，源码转义保留（供装配层渲染/降级）
      return `<div class="md-mermaid" data-mermaid>${md.utils.escapeHtml(token.content)}</div>\n`
    }
    return defaultFence(tokens, idx, options, env, self)
  }
}

function buildMd(opts: RenderOptions = {}): MarkdownItInstance {
  const md = new MarkdownIt()
  md.options.html = true // ADR-0002：放行原始 HTML
  md.options.linkify = true
  configureHighlight(md)
  if (opts.mermaid) configureMermaid(md)
  opts.math?.attach(md)
  return md
}

const defaultMd = buildMd()

export function renderNote(markdown: string): string {
  return defaultMd.render(markdown)
}

/** 工厂：返回带指定（可选）渲染选项的渲染函数；无 options 与 renderNote 行为一致 */
export function createMd(opts?: RenderOptions): (src: string) => string {
  const md = buildMd(opts)
  return (src) => md.render(src)
}

/**
 * 预检正文是否可能出现公式（含 $ 或反斜杠），
 * 没有则 ReaderView 可跳过按需 import（07a 决策）。
 */
export function mayHaveMath(content: string): boolean {
  return content.includes('$') || content.includes('\\')
}

/** 预检正文是否含 ```mermaid 围栏（07b），没有则跳过按需 import */
export function mayHaveMermaid(content: string): boolean {
  // 与 configureMermaid 的判定对齐（info.trim().toLowerCase() === 'mermaid'）：
  // 支持大小写、反引号/波浪号围栏、围栏后的空格；漏检的方向是“不 wire、静默显示源码”，必须避免。
  return /(?:^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*mermaid[ \t]*(?:\n|$)/im.test(content)
}

