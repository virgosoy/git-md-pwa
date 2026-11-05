// S1 · 笔记按顶层目录分组（纯函数）
// 卡片分组便于 591 篇级别的列表浏览；根目录文件归入 '/'。

export interface NoteGroup {
  /** 顶层目录名；根目录文件用 '/' */
  dir: string
  /** 组内已排序的路径 */
  files: string[]
}

export function groupNotesByTopDir(paths: string[]): NoteGroup[] {
  const sorted = [...paths].sort((a, b) => a.localeCompare(b))
  const byDir = new Map<string, string[]>()
  for (const p of sorted) {
    const i = p.indexOf('/')
    const dir = i === -1 ? '/' : p.slice(0, i)
    const arr = byDir.get(dir) ?? []
    arr.push(p)
    byDir.set(dir, arr)
  }
  return [...byDir.entries()].map(([dir, files]) => ({ dir, files }))
}
