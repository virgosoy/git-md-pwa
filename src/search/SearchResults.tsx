// 搜索命中列表：文件名恒为主行（命中段高亮），标题行逐条展示（H 徽标 + 标题文本），
// 目录与正文摘录随命中显示；命中的子串统一包 <mark class="search-hit">。
// 票 21：标题行是独立点击目标——点它打开笔记并跳到该标题；卡内其余区域仍普通打开。
// 高亮切段是纯函数 highlightSegments（独立单测），组件只做渲染。

import type { HeadingAnchor, SearchHit } from './index'

export interface SearchResultsProps {
  hits: SearchHit[]
  query: string
  onOpen: (path: string) => void
  /** 点标题行：打开笔记并跳到该标题（票 21） */
  onOpenHeading: (path: string, anchor: HeadingAnchor) => void
}

/**
 * 把 text 里所有命中的子串（大小写不敏感）切成 [{text, hit}] 段，未命中的部分原样保留。
 * 空查询返回整段非命中；重叠命中按推进游标逐个消费（`aaaa` + `aa` → `[aa][aa]`）。
 */
export function highlightSegments(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const q = query.trim().toLowerCase()
  if (!q) return text ? [{ text, hit: false }] : []
  const lower = text.toLowerCase()
  const out: Array<{ text: string; hit: boolean }> = []
  let i = 0
  while (i < lower.length) {
    const idx = lower.indexOf(q, i)
    if (idx === -1) {
      if (i < text.length) out.push({ text: text.slice(i), hit: false })
      break
    }
    if (idx > i) out.push({ text: text.slice(i, idx), hit: false })
    out.push({ text: text.slice(idx, idx + q.length), hit: true })
    i = idx + q.length
  }
  if (out.length === 0 && text) out.push({ text, hit: false })
  return out
}

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightSegments(text, query).map((s, i) =>
        s.hit ? (
          <mark key={i} class="search-hit">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  )
}

/** 把镜像路径拆成「文件名 stem（去 .md）」与「目录（含尾斜杠）」；无目录返回空串 */
function stemAndDir(path: string): { stem: string; dir: string } {
  const slash = path.lastIndexOf('/')
  const file = slash === -1 ? path : path.slice(slash + 1)
  return { stem: file.replace(/\.md$/i, ''), dir: slash === -1 ? '' : path.slice(0, slash + 1) }
}

export function SearchResults({ hits, query, onOpen, onOpenHeading }: SearchResultsProps) {
  if (hits.length === 0) {
    return <p class="app__hint">没有匹配。</p>
  }
  return (
    <ul class="recent__list">
      {hits.map((h) => {
        const { stem, dir } = stemAndDir(h.path)
        return (
          <li key={h.path}>
            {/* 容器不是按钮（标题行要成为独立点击目标）：卡内空白/目录/摘录走普通打开 */}
            <div class="recent__item search-item" onClick={() => onOpen(h.path)}>
              <button
                type="button"
                class="search-item__name"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(h.path)
                }}
              >
                <Highlight text={stem} query={query} />
              </button>
              {h.headingHits.map((hh, i) => (
                <button
                  type="button"
                  class="search-item__heading"
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenHeading(h.path, hh)
                  }}
                >
                  <span class="search-item__level">H{hh.level}</span>
                  <Highlight text={hh.text} query={query} />
                </button>
              ))}
              {dir && (
                <span class="search-item__path">
                  <Highlight text={dir} query={query} />
                </span>
              )}
              {h.bodyMatch && h.bodySnippet && (
                <span class="search-item__snippet">
                  …<Highlight text={h.bodySnippet} query={query} />…
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
