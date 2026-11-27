// 新建笔记弹层：目录下拉（只来自既有镜像目录）+ 文件名输入。
// 只收集输入、做即时校验与展示错误；创建编排（提交、回填、进入编辑器）由 App 负责。

import { useState } from 'preact/hooks'
import { normalizeFileName } from './newNote'

export interface NewNotePanelProps {
  /** 根目录固定首项，其余为镜像中的目录 */
  directories: readonly string[]
  /** 本次会话记住的上次选择 */
  initialDir: string
  busy: boolean
  /** 来自 App 的创建失败提示（保留输入，面板不关闭） */
  error: string | null
  onDirChange: (dir: string) => void
  /** 用户改动任一字段：App 清掉上一次的创建失败提示 */
  onFieldChange: () => void
  onCancel: () => void
  onCreate: (dir: string, rawName: string) => void
}

export function NewNotePanel({
  directories,
  initialDir,
  busy,
  error,
  onDirChange,
  onFieldChange,
  onCancel,
  onCreate
}: NewNotePanelProps) {
  const [dir, setDir] = useState(initialDir)
  const [rawName, setRawName] = useState('')
  const normalized = normalizeFileName(rawName)
  const hint = normalized.error ?? error
  const canCreate = !busy && normalized.name !== '' && normalized.error == null

  return (
    <div
      class="conflict"
      role="dialog"
      aria-modal="true"
      aria-label="新建笔记"
      onClick={busy ? undefined : onCancel}
    >
      <div class="conflict__box new-note" onClick={(e) => e.stopPropagation()}>
        <h2 class="conflict__title">新建笔记</h2>

        <label class="new-note__field">
          <span class="new-note__label">目录</span>
          <select
            class="new-note__select"
            value={dir}
            disabled={busy}
            onChange={(e) => {
              const next = e.currentTarget.value
              setDir(next)
              onDirChange(next)
              onFieldChange()
            }}
          >
            {directories.map((d) => (
              <option key={d} value={d}>
                {d === '/' ? '/（根目录）' : d}
              </option>
            ))}
          </select>
        </label>

        <label class="new-note__field">
          <span class="new-note__label">文件名</span>
          <input
            class="new-note__input"
            type="text"
            value={rawName}
            placeholder="例如：我的笔记"
            autocomplete="off"
            disabled={busy}
            onInput={(e) => {
              setRawName(e.currentTarget.value)
              onFieldChange()
            }}
          />
        </label>

        {hint && <p class="conflict__error">{hint}</p>}

        <div class="conflict__actions">
          <button
            type="button"
            class="btn btn--primary"
            disabled={!canCreate}
            onClick={() => onCreate(dir, rawName)}
          >
            {busy ? '创建中…' : '创建'}
          </button>
          <button type="button" class="btn" disabled={busy} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
