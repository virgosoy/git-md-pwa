// 07a · 按需加载的数学渲染模块
// 只在 setRenderMath 开启且正文可能含公式时被动态 import（关=完全不接插件，
// 主包零 katex 依赖）。KaTeX CSS 用 ?inline 注入：字体 url() 会被 Vite 重写为
// 产物资产的绝对路径（勿用 ?raw，否则相对路径 404），由 emit 的字体资产配套。

import type { MarkdownIt as MarkdownItInstance } from 'markdown-it'
import type { MathEngine } from './render'
import katexCss from 'katex/dist/katex.min.css?inline'

/** KaTeX 排版 CSS（含重写后的字体 URL），注入 shadow root */
export const KATEX_CSS: string = katexCss

let mathEngine: Promise<MathEngine> | null = null

/** 懒加载 katex + 插件并缓存；注入引擎使坏公式走 .katex-error 降级而非抛错 */
export function loadMathEngine(): Promise<MathEngine> {
  if (!mathEngine) {
    mathEngine = (async () => {
      const [{ default: katex }, mod] = await Promise.all([
        import('katex'),
        import('@vscode/markdown-it-katex')
      ])
      const plugin = mod.default
      return {
        attach(md: MarkdownItInstance): void {
          // token 级解析；enableBareBlocks 支持裸 \begin{…}\end{…} 环境。
          // 插件声明的 katex 依赖已由 package.json overrides 固定到 0.19.1（去重，
          // 避免按需图里出现第二份 katex）；此处仍显式注入，运行时只透传给 renderToString。
          md.use(plugin, {
            katex,
            throwOnError: false,
            enableBareBlocks: true
          })
        }
      }
    })().catch((err) => {
      // 加载失败可重试（不缓存失败的 promise）
      mathEngine = null
      throw err
    })
  }
  return mathEngine
}
