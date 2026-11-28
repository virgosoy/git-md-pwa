// 新建笔记弹层：目录下拉（只来自既有镜像目录）+ 可选新建目录 + 文件名输入。
// 只收集输入、做即时校验与展示错误；创建编排（提交、回填、进入编辑器）由 App 负责。

import { useState } from 'preact/hooks'
import { resolveNoteTarget } from './newNote'

export interface NewNoteInput {
  /** 选中的父目录；根目录为 '/' */
  baseDir: string
  /** 新建目录的相对路径（原始输入）；null = 不新建目录 */
  rawDir: string | null
  rawName: string
}

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
  onCreate: (input: NewNoteInput) => void
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
  const [newDirMode, setNewDirMode] = useState(false)
  const [rawDir, setRawDir] = useState('')
  // 弹层预览与 App 提交共用同一个解析函数，避免两处各拼一次路径
  const target = resolveNoteTarget(dir, newDirMode ? rawDir : null, rawName)
  const dirExists =
    newDirMode && target.dir !== '' && directories.includes(target.dir)
  const hint = target.error ?? error
  const canCreate = !busy && target.error == null && target.path !== ''
  const showPreview =
    newDirMode && target.path !== '' && target.error == null && error == null
  const directoryLabel = newDirMode ? '父目录' : '目录'
  const toggleLabel = newDirMode ? '✓ 新建目录' : '＋ 新建目录'
  const createLabel = busy
    ? '创建中…'
    : newDirMode
      ? '创建目录并新建笔记'
      : '创建'

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
          <span class="new-note__label">{directoryLabel}</span>
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

        <div class="new-note__modes">
          <button
            type="button"
            class="btn new-note__toggle"
            aria-pressed={newDirMode}
            disabled={busy}
            onClick={() => {
              const next = !newDirMode
              setNewDirMode(next)
              if (!next) setRawDir('')
              onFieldChange()
            }}
          >
            {toggleLabel}
          </button>
        </div>

        {newDirMode && (
          <label class="new-note__field">
            <span class="new-note__label">新目录路径（相对上面的目录，可多级）</span>
            <input
              class="new-note__input new-note__dir-input"
              type="text"
              value={rawDir}
              placeholder="例如：a/b/c"
              autocomplete="off"
              disabled={busy}
              onInput={(e) => {
                setRawDir(e.currentTarget.value)
                onFieldChange()
              }}
            />
          </label>
        )}

        <label class="new-note__field">
          <span class="new-note__label">文件名</span>
          <input
            class="new-note__input new-note__name-input"
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

        {dirExists && (
          <p class="conflict__hint">目录已存在，将直接在该目录新建笔记</p>
        )}
        {hint && <p class="conflict__error">{hint}</p>}
        {showPreview && (
          <p class="new-note__preview">将创建：{target.path}</p>
        )}

        <div class="conflict__actions">
          <button
            type="button"
            class="btn btn--primary"
            disabled={!canCreate}
            onClick={() =>
              onCreate({
                baseDir: dir,
                rawDir: newDirMode ? rawDir : null,
                rawName
              })
            }
          >
            {createLabel}
          </button>
          <button type="button" class="btn" disabled={busy} onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
