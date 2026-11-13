// 全局搜索（票 06 → 票 12）：从镜像的 md 建立「标题 + 正文」索引。
// 纯函数模块：extractHeadings 抽取标题、buildIndex 建档（标题 + 正文）、
// findBodySnippet 摘录正文命中行、searchNotes 匹配（文件/标题/正文三态）。

export interface Heading {
  level: number
  text: string
}

// 围栏开口是前缀匹配（` ```js` 这类开栅信息行）；闭合必须是纯围栏行。
const FENCE_OPEN_RE = /^(```|~~~)/
function fenceCloses(line: string, ch: '`' | '~'): boolean {
  return ch === '`' ? /^`{3,}$/.test(line) : /^~{3,}$/.test(line)
}

/**
 * 抽取 H1-H6 标题。代码块围栏内的井号不算标题。
 * 行尾 ` #+` 有前置空格才剥掉（CommonMark：`foo#` 保留，`foo ##` 剥成 `foo`）。
 */
export function extractHeadings(content: string): Heading[] {
  const out: Heading[] = []
  let fenceChar: '`' | '~' | null = null

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (fenceChar) {
      if (fenceCloses(line, fenceChar)) fenceChar = null
      continue
    }
    if (FENCE_OPEN_RE.test(line)) {
      fenceChar = line[0] as '`' | '~'
      continue
    }
    const m = line.match(/^(#{1,6})\s+(.+)$/)
    if (m) {
      let text = m[2].trim()
      if (/[ \t]+#+$/.test(text)) text = text.replace(/[ \t]+#+$/, '').trim()
      out.push({ level: m[1].length, text })
    }
  }
  return out
}

// S2 · 索引与搜索

export interface IndexEntry {
  path: string
  headings: Heading[]
  /** 全文正文原文（保留引用，不复制字符串——JS 字符串不可变） */
  body: string
}

export interface SearchHit {
  path: string
  /** 命中路径/文件名（含大小写不敏感） */
  fileMatch: boolean
  /** 命中的标题（0-N 条；非空即视为「标题」命中，含 H1） */
  headingHits: Heading[]
  /** 命中的正文（非标题、非围栏标记行的文本） */
  bodyMatch: boolean
  /** 正文命中的上下文摘录（未命中为 null） */
  bodySnippet: string | null
}

export function buildIndex(files: Array<{ path: string; content: string }>): IndexEntry[] {
  return files.map((f) => ({ path: f.path, headings: extractHeadings(f.content), body: f.content }))
}

// 正文摘录截断长度（字符）
const SNIPPET_MAX = 140

/**
 * 在正文（非标题、非围栏标记行）里找首个命中行，返回 trim 后的摘录（超长截断加 `…`）。
 * 围栏感知：代码块内算正文可搜；围栏标记行本身跳过。
 */
export function findBodySnippet(content: string, query: string): string | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  let fenceChar: '`' | '~' | null = null

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (fenceChar) {
      if (fenceCloses(line, fenceChar)) {
        fenceChar = null
        continue
      }
      // 围栏内正文（代码）可搜
    } else if (FENCE_OPEN_RE.test(line)) {
      fenceChar = line[0] as '`' | '~'
      continue
    } else if (/^#{1,6}\s+/.test(line)) {
      continue // 标题行不算正文
    }
    if (line.toLowerCase().includes(q)) {
      return line.length > SNIPPET_MAX ? line.slice(0, SNIPPET_MAX) + '…' : line
    }
  }
  return null
}

/**
 * 按片段检索索引：路径/文件名、标题、正文任一含片段（大小写不敏感）即命中。
 * 空查询返回空数组；结果按路径排序。
 */
export function searchNotes(index: IndexEntry[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  for (const e of index) {
    const fileMatch = e.path.toLowerCase().includes(q)
    const headingHits = e.headings.filter((h) => h.text.toLowerCase().includes(q))
    const bodySnippet = findBodySnippet(e.body, query)
    if (fileMatch || headingHits.length > 0 || bodySnippet !== null) {
      hits.push({
        path: e.path,
        fileMatch,
        headingHits,
        bodyMatch: bodySnippet !== null,
        bodySnippet
      })
    }
  }
  return hits.sort((a, b) => a.path.localeCompare(b.path))
}
