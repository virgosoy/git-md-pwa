// 全局标题搜索（票 06）：从镜像的 md 建立「标题索引」，支持 H1-H6 检索。
// 纯函数模块：extractHeadings 抽取、buildIndex 建档、searchHeadings 匹配。

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
}

export interface SearchHit {
  path: string
  /** 命中路径/文件名（含大小写不敏感） */
  fileMatch: boolean
  /** 命中的标题（0-N 条；非空即视为「标题」命中，含 H1） */
  headingHits: Heading[]
}

export function buildIndex(files: Array<{ path: string; content: string }>): IndexEntry[] {
  return files.map((f) => ({ path: f.path, headings: extractHeadings(f.content) }))
}

/**
 * 按片段检索索引：标题或路径/文件名只要包含片段（大小写不敏感）即命中。
 * 空查询返回空数组；结果按路径排序。
 */
export function searchHeadings(index: IndexEntry[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  for (const e of index) {
    const fileMatch = e.path.toLowerCase().includes(q)
    const headingHits = e.headings.filter((h) => h.text.toLowerCase().includes(q))
    if (fileMatch || headingHits.length > 0) {
      hits.push({ path: e.path, fileMatch, headingHits })
    }
  }
  return hits.sort((a, b) => a.path.localeCompare(b.path))
}
