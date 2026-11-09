// 08 · 单篇 TOC：从渲染后的正文 DOM 抽 H1–H6 建目录（纯函数为主，可测）。
// 目录条目来自渲染后的 shadow DOM（文本/层级/顺序即所见），不复用 search/extractHeadings
//（它吃 markdown 原文，标题里的行内标记会残留）；jsdom 无布局，几何交互拿元素实例打桩测。

export interface TocHeading {
  level: number
  text: string
  id: string
  el: Element
}

/** 标题 → 锚点 id：保留 Unicode 字母数字，其余折叠为单个 `-`，去首尾；空则兜底 `sec-N`。 */
export function slugify(text: string, fallbackIndex: number): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return s || `sec-${fallbackIndex}`
}

/**
 * 为宿主内 h1–h6 赋唯一 id，返回按文档序的目录条目。
 * 跳过 `pre`/`code` 内的标题（raw HTML 防御：那里没有 scoped id 的跳转意义）。
 */
export function assignHeadingIds(root: ParentNode): TocHeading[] {
  const used = new Set<string>()
  const out: TocHeading[] = []
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el, i) => {
    if (el.closest('pre, code')) return
    const text = (el.textContent ?? '').trim()
    const base = slugify(text, i + 1)
    let id = base
    let n = 2
    while (used.has(id)) {
      id = `${base}-${n}`
      n += 1
    }
    used.add(id)
    el.setAttribute('id', id)
    out.push({ level: Number(el.tagName.slice(1)), text, id, el })
  })
  return out
}

/**
 * 把标题滚到 host（滚动容器）顶下 offset 处所需的 scrollTop。
 * 用 getBoundingClientRect 差值得相对偏移，跨 Shadow DOM 边界也成立；
 * 上界由浏览器对 scrollTop 赋值的原生夹取兜底（jsdom 测不到 scrollHeight）。
 */
export function headingScrollTarget(host: HTMLElement, heading: Element, offset = 12): number {
  const hostRect = host.getBoundingClientRect()
  const headRect = heading.getBoundingClientRect()
  return Math.max(0, host.scrollTop + (headRect.top - hostRect.top) - offset)
}

/** 当前所在章节：scrollTop 已越过其目标位置的最后一个标题；无则 -1（还在首个标题上方）。 */
export function currentHeadingIndex(targets: number[], scrollTop: number): number {
  let idx = -1
  for (let i = 0; i < targets.length; i++) {
    if (targets[i] <= scrollTop) idx = i
  }
  return idx
}
