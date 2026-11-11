// 09 · 单篇笔记内查找（应用内 find-in-note）：在渲染后的 Shadow DOM 正文里做子串匹配。
// 纯函数为主（可测）；高亮用「拆分文本节点 + <mark data-find>」而非 innerHTML 替换，
// 保住 ADR-0002 的 raw HTML 透传结构。前提：调用方先 clearMarks（本次 applyFind 自带）。
// 匹配范围 = .md-body（调用方传入 root）；跳过 Mermaid 渲染出的 SVG 子树、script/style 等
// 不可见/非正文文本；Mermaid 关闭或渲染失败时宿主块不再带 data-mermaid，源码自然可搜。

export interface LeafText {
  node: Text
  text: string
}

export interface TextMatch {
  start: number
  end: number
}

export interface FindHit {
  /** 叶子下标（collectLeafTexts 的返回序） */
  leaf: number
  start: number
  end: number
}

/**
 * 单段文本内的大小写不敏感、非重叠子串命中（起始下标即码位下标）。
 * 空查询返回空数组。说明：`toLowerCase` 极少数拉长字符（如 İ）下
 * 下标与原文错位，对中文/ASCII 笔记无影响，接受此边界。
 */
export function findMatchesInText(text: string, query: string): TextMatch[] {
  const q = query.toLowerCase()
  if (!q) return []
  const lower = text.toLowerCase()
  const out: TextMatch[] = []
  let from = 0
  while (from <= lower.length - q.length) {
    const i = lower.indexOf(q, from)
    if (i === -1) break
    out.push({ start: i, end: i + q.length })
    from = i + q.length
  }
  return out
}

/** 跳过：渲染后的 Mermaid 容器（SVG 文字碎片）、raw HTML 透传的脚本/样式等不可见节点。 */
const SKIP_SELECTOR = 'script, style, template, noscript, [data-mermaid]'

/**
 * 收集 root 内按文档序的叶子文本节点；跳过 SKIP_SELECTOR 子树。
 * 返回的 LeafText.node 是真实 Text 节点，供后续 split+wrap。
 */
export function collectLeafTexts(root: ParentNode): LeafText[] {
  const out: LeafText[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (parent && parent.closest?.(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  let n: Node | null
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) {
    out.push({ node: n as Text, text: n.nodeValue ?? '' })
  }
  return out
}

/** 把每片叶子的命中按文档序展平（附叶子下标）。 */
export function planFind(leaves: LeafText[], query: string): FindHit[] {
  const out: FindHit[] = []
  leaves.forEach((leaf, leafIndex) => {
    for (const m of findMatchesInText(leaf.text, query)) {
      out.push({ leaf: leafIndex, start: m.start, end: m.end })
    }
  })
  return out
}

/**
 * 清掉上次高亮的 mark 并把相邻文本节点合并回原位（normalize），
 * 保证「换查询」后跨旧边界的新命中依然可匹配。
 */
export function clearMarks(root: ParentNode): void {
  const marks = Array.from(root.querySelectorAll('mark[data-find]'))
  for (const m of marks) {
    const parent = m.parentNode
    if (!parent) continue
    while (m.firstChild) parent.insertBefore(m.firstChild, m)
    parent.removeChild(m)
  }
  if (typeof root.normalize === 'function') root.normalize()
}

/** 把 textNode 的 [start,end) 段包进 <mark class="find-hit" data-find>，插回原位。 */
function highlightLeaf(textNode: Text, start: number, end: number): void {
  const parent = textNode.parentNode
  if (!parent) return
  const mark = document.createElement('mark')
  mark.className = 'find-hit'
  mark.setAttribute('data-find', '')
  const tail = textNode.splitText(end)
  if (start === 0) {
    mark.appendChild(textNode)
    parent.insertBefore(mark, tail)
  } else {
    const mid = textNode.splitText(start)
    mark.appendChild(mid)
    parent.insertBefore(mark, tail)
  }
}

/** 高亮 root 内全部命中；返回命中总数，当前命中落在 index 0。空查询只清不留。 */
export function applyFind(root: ParentNode, query: string): number {
  clearMarks(root)
  if (!query) return 0
  const leaves = collectLeafTexts(root)
  const hits = planFind(leaves, query)
  // 逆序处理保证同一叶子多处命中时先切右侧、坐标不失真
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i]
    highlightLeaf(leaves[hit.leaf].node, hit.start, hit.end)
  }
  if (hits.length > 0) setCurrentMark(root, 0)
  return hits.length
}

/** 把「当前命中」标到第 index 个 mark（循环用），其余取消。 */
export function setCurrentMark(root: ParentNode, index: number): void {
  const marks = root.querySelectorAll('mark[data-find]')
  marks.forEach((m, i) => m.classList.toggle('is-current', i === index))
}
