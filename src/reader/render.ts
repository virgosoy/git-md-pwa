// S1 · 渲染管线
// markdown-it（CommonMark + 表格）+ highlight.js 代码高亮。
// 原始 HTML 透传（ADR-0002）：<style> 等保留原文，供 Shadow DOM 作用域复用；
// 由 innerHTML 注入的 <script> 天然不执行，无需额外净化。
// 07a · createMd(engine?) 工厂：无引擎行为与 renderNote 完全一致；
// 注入 MathEngine 才挂 KaTeX 公式插件（引擎由 math.ts 按需构建，本模块不静态依赖 katex）。

import MarkdownIt from 'markdown-it'
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it'
import hljs from 'highlight.js'

/** 可注入的公式引擎：把公式插件挂到 markdown-it 实例（关=不注入） */
export interface MathEngine {
  attach(md: MarkdownItInstance): void
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

function buildMd(engine?: MathEngine): MarkdownItInstance {
  const md = new MarkdownIt()
  md.options.html = true // ADR-0002：放行原始 HTML
  md.options.linkify = true
  configureHighlight(md)
  engine?.attach(md)
  return md
}

const defaultMd = buildMd()

export function renderNote(markdown: string): string {
  return defaultMd.render(markdown)
}

/** 工厂：返回带指定（可选）公式引擎的渲染函数；无引擎与 renderNote 行为一致 */
export function createMd(engine?: MathEngine): (src: string) => string {
  const md = buildMd(engine)
  return (src) => md.render(src)
}

/**
 * 预检正文是否可能出现公式（含 $ 或反斜杠），
 * 没有则 ReaderView 可跳过按需 import（07a 决策）。
 */
export function mayHaveMath(content: string): boolean {
  return content.includes('$') || content.includes('\\')
}

