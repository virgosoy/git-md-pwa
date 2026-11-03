// S1 · 渲染管线
// markdown-it（CommonMark + 表格）+ highlight.js 代码高亮。
// 原始 HTML 透传（ADR-0002）：<style> 等保留原文，供 Shadow DOM 作用域复用；
// 由 innerHTML 注入的 <script> 天然不执行，无需额外净化。

import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt()
md.options.html = true // ADR-0002：放行原始 HTML
md.options.linkify = true

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

export function renderNote(markdown: string): string {
  return md.render(markdown)
}
