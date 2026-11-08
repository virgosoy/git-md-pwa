// 07b · 按需加载的 Mermaid 装配模块
// 只在 renderMermaid 开启且正文含 ```mermaid 围栏时被动态 import。
// Shadow DOM 对策：不把 shadow root 交给 mermaid——让 mermaid 在自己临时 DOM 节点里
// render，只把返回的（自包含，含 <style> 与 url(#id)）svg 字符串注入宿主块
// （ADR-0003 模式延续）。mermaid.render 的 bindFunctions 点击交互放弃。

/** mermaid 10.x 暴露的运行时 API 形状（与 mermaid dist 的默认导出兼容） */
export interface MermaidApi {
  initialize(opts: Record<string, unknown>): void
  parse(src: string): Promise<boolean | void>
  render(id: string, src: string): Promise<{ svg: string }>
}

let idSeq = 0

/** 每图唯一 id：mermaid 用 id 生成 svg 内 url(#id) 等引用，撞 id 会坏 */
export function nextMermaidId(): string {
  idSeq += 1
  return `md-mm-${idSeq.toString(36)}`
}

/** 提取宿主里待渲染的 Mermaid 块（markdown-it 07b 输出的 data-mermaid 宿主块） */
export function collectMermaidBlocks(host: ParentNode): Element[] {
  return Array.from(host.querySelectorAll('[data-mermaid]'))
}

/** 降级：保留源码文本 + 内联「渲染失败」标（块公式照抄 07a 的静默降级语义） */
function appendErrorLabel(block: Element): void {
  const label = document.createElement('p')
  label.className = 'md-mermaid-error'
  label.textContent = '渲染失败'
  block.appendChild(label)
}

export interface WireMermaidContext {
  /** 宿主是否仍有效（切走笔记后 false，避免把旧图写回已替换的 DOM） */
  alive: () => boolean
}

/**
 * 把宿主内所有 [data-mermaid] 块逐个渲染为 SVG；语法/render 失败或分块加载失败
 * 一律降级——保留源码（加载失败不加标，块已由 markdown-it 转义）。无块则不动。
 */
export async function wireMermaid(host: ParentNode, ctx: WireMermaidContext): Promise<void> {
  const blocks = collectMermaidBlocks(host)
  if (blocks.length === 0) return

  let mermaid: MermaidApi
  try {
    mermaid = (await import('mermaid')).default as MermaidApi
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  } catch {
    return // 分块加载失败：宿主块已保留源码
  }

  for (const block of blocks) {
    if (!ctx.alive()) return
    const source = block.textContent ?? ''
    if (!source.trim()) continue

    // 校验与渲染分成两步（逐图 try/catch）：parse 失败不打 render
    let valid = false
    try {
      valid = (await mermaid.parse(source)) !== false
    } catch {
      valid = false
    }
    if (!valid) {
      if (!ctx.alive()) return
      appendErrorLabel(block)
      continue
    }

    let svg: string
    try {
      const out = await mermaid.render(nextMermaidId(), source)
      svg = out.svg
    } catch {
      if (!ctx.alive()) return
      appendErrorLabel(block)
      continue
    }

    if (!ctx.alive()) return
    block.innerHTML = svg
  }
}
