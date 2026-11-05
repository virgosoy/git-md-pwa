// S2 · 全部笔记列表：按顶层目录分组，点开可用，未镜像的带标记。

import { groupNotesByTopDir } from './group'
import type { StoredFile } from '../mirror/store'

export interface NotesListProps {
  files: StoredFile[]
  onOpen: (path: string) => void
}

export function NotesList({ files, onOpen }: NotesListProps) {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const groups = groupNotesByTopDir(files.map((f) => f.path))

  return (
    <div class="notes-list">
      {groups.map((g) => (
        <section key={g.dir} class="notes-list__group">
          <h2 class="notes-list__dir">{g.dir === '/' ? '根目录' : g.dir}</h2>
          <ul class="notes-list__files">
            {g.files.map((path) => {
              const f = byPath.get(path)!
              return (
                <li key={path}>
                  <button class="recent__item" onClick={() => onOpen(path)}>
                    {f.status === 'too-large' ? `⚠ ${path}（未镜像）` : path}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
