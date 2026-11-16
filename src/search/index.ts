// 全局搜索（票 06 → 票 12 → 票 15）：从镜像的 md 建立「标题 + 正文」索引。
// 纯函数模块：extractHeadings 抽取标题、buildIndex 建档（标题 + 正文）、
// findBodySnippet 摘录正文命中行、searchNotes 匹配（文件/标题/正文三态）。
// 票 15：extractHeadings 默认改走 markdown-it token 流（容器包裹的标题也抽得出），
// 保留 regex 模式作为回退（设置开关 betterHeadingExtract=false 时用）。

import MarkdownIt from 'markdown-it'
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it'

export interface Heading {
  level: number
  text: string
}

/** 标题抽取模式：token=markdown-it 块级 token（默认，渲染器语义）；regex=旧逐行正则 */
export type ExtractMode = 'token' | 'regex'

// 建索引的最小 markdown-it 实例：仅 CommonMark + 表格，不需要 linkify/highlight
//（那些只在渲染阶段用；parse 只产出 block/inline token）。
const indexMd: MarkdownItInstance = new MarkdownIt()

// 围栏开口是前缀匹配（` ```js` 这类开栅信息行）；闭合必须是纯围栏行。
const FENCE_OPEN_RE = /^(```|~~~)/
function fenceCloses(line: string, ch: '`' | '~'): boolean {
  return ch === '`' ? /^`{3,}$/.test(line) : /^~{3,}$/.test(line)
}

/**
 * 抽取 H1-H6 标题。默认 token 流（markdown-it）：代码块围栏内的井号、`#` 无空格
 * 等 Markdown 语义由解析器裁决，容器（引用/列表）内标题也抽得出，与渲染/单篇 TOC 一致。
 * `mode='regex'` 退回旧逐行正则（设置开关关时用）。
 * 行尾 ` #+` 有前置空格才剥掉（CommonMark：`foo#` 保留，`foo ##` 剥成 `foo`）。
 */
export function extractHeadings(content: string, mode: ExtractMode = 'token'): Heading[] {
  return mode === 'token' ? extractHeadingsToken(content) : extractHeadingsRegex(content)
}

function extractHeadingsToken(content: string): Heading[] {
  const tokens = indexMd.parse(content, {})
  const out: Heading[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const m = /^h([1-6])$/.test(t.tag || '')
    if (t.type === 'heading_open' && m) {
      // heading_open 紧跟 inline token：其 content 即标题文本（含行内标记原样）
      const inline = tokens[i + 1]
      const text = inline && inline.type === 'inline' ? (inline.content || '').trim() : ''
      out.push({ level: Number(t.tag.slice(1)), text })
    }
  }
  return out
}

function extractHeadingsRegex(content: string): Heading[] {
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

export function buildIndex(
  files: Array<{ path: string; content: string }>,
  mode: ExtractMode = 'token'
): IndexEntry[] {
  return files.map((f) => ({
    path: f.path,
    headings: extractHeadings(f.content, mode),
    body: f.content
  }))
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
 * 空查询返回空数组。
 * 排序（票 14）：档位 文件名 > 标题 > 目录 > 正文；档内 精确 > 前缀 > 包含；
 * 标题档同质量越深越前（H6 > … > H1）；最终平局按 path。
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
  // 排序键一次算好再排（Schwartzian），比较器不再重算 rank
  return hits
    .map((h) => ({ hit: h, rank: rankHit(h, q) }))
    .sort((a, b) => compareRanks(a.rank, b.rank, a.hit.path, b.hit.path))
    .map((x) => x.hit)
}

// 排序档位：数值越小越靠前。文件名(0) > 标题(1) > 目录(2) > 正文(3)
const BUCKET_FILE = 0
const BUCKET_HEADING = 1
const BUCKET_DIR = 2
const BUCKET_BODY = 3

interface HitRank {
  bucket: number
  /** 档内质量：0 精确 > 1 前缀 > 2 包含 */
  quality: number
  /** 标题档：命中的标题级别（越深越大；同质量 H6 在前） */
  level: number
}

/** 去掉扩展名的文件名（镜像只收 .md） */
function fileNameStem(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return base.replace(/\.md$/i, '')
}

// 目录档/正文档：quality/level 不参与排序（恒 0，只比 path）
const DIR_RANK: HitRank = { bucket: BUCKET_DIR, quality: 0, level: 0 }
const BODY_RANK: HitRank = { bucket: BUCKET_BODY, quality: 0, level: 0 }

/**
 * 每个命中只进它命中的最高档：
 * 文件名命中 → 文件档；否则标题命中 → 标题档；否则仅路径命中 → 目录档；否则正文命中 → 正文档。
 */
function rankHit(h: SearchHit, q: string): HitRank {
  // 查询串与文件名同侧剥 .md：两端都剥才可比（避免把整文件名「归档.md」当成目录命中降档）；
  // 仅当查询确实带 .md 后缀且前文非空才剥（防 q==='.md' 时 startWith('') 全中）
  const qStem = q.length > 3 && q.endsWith('.md') ? q.slice(0, -3) : q
  const stem = fileNameStem(h.path).toLowerCase()
  if (stem === qStem) return { bucket: BUCKET_FILE, quality: 0, level: 0 }
  if (stem.startsWith(qStem)) return { bucket: BUCKET_FILE, quality: 1, level: 0 }
  if (stem.includes(qStem)) return { bucket: BUCKET_FILE, quality: 2, level: 0 }
  if (h.headingHits.length > 0) {
    // 多标题命中取最优：更精确优先；同质量取最深
    let quality = 3
    let level = 0
    for (const hh of h.headingHits) {
      const t = hh.text.toLowerCase()
      const qq = t === q ? 0 : t.startsWith(q) ? 1 : 2
      if (qq < quality || (qq === quality && hh.level > level)) {
        quality = qq
        level = hh.level
      }
    }
    return { bucket: BUCKET_HEADING, quality, level }
  }
  if (h.fileMatch) return DIR_RANK
  return BODY_RANK
}

function compareRanks(ar: HitRank, br: HitRank, ap: string, bp: string): number {
  if (ar.bucket !== br.bucket) return ar.bucket - br.bucket
  // 只有文件名/标题档有质量与深度：目录/正文档恒 0，直接比 path
  if (ar.bucket === BUCKET_FILE || ar.bucket === BUCKET_HEADING) {
    if (ar.quality !== br.quality) return ar.quality - br.quality
    if (ar.bucket === BUCKET_HEADING && ar.level !== br.level) return br.level - ar.level
  }
  return ap.localeCompare(bp)
}
