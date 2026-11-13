// 搜索命中列表：区分「标题/文件」命中来源，点了进阅读器。

import type { SearchHit } from './index'

const JOIN = '；'

export interface SearchResultsProps {
  hits: SearchHit[]
  onOpen: (path: string) => void
}

export function SearchResults({ hits, onOpen }: SearchResultsProps) {
  if (hits.length === 0) {
    return <p class="app__hint">没有匹配。</p>
  }
  return (
    <ul class="recent__list">
      {hits.map((h) => (
        <li key={h.path}>
          <button class="recent__item search-item" onClick={() => onOpen(h.path)}>
            {h.fileMatch && <span class="tag">文件</span>}
            {h.headingHits.length > 0 && (
              <span class="tag">{h.headingHits.map((hh) => `标题 H${hh.level}`).join(JOIN)}</span>
            )}
            {h.bodyMatch && <span class="tag">正文</span>}
            <span class="search-item__text">
              {h.headingHits.length > 0
                ? h.headingHits.map((hh) => hh.text).join(JOIN)
                : h.bodySnippet ?? h.path}
            </span>
            <span class="search-item__path">{h.path}</span>
            {h.bodyMatch && h.bodySnippet && h.headingHits.length > 0 && (
              <span class="search-item__snippet">…{h.bodySnippet}…</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
