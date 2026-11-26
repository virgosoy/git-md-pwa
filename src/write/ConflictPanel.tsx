// 冲突面板：保存时远端文件已变化（或已被删除）。
// 只读预览远端源文，由用户显式选择覆盖/重新创建、放弃或取消；放弃需要二次确认。

import { useState } from 'preact/hooks'

export interface ConflictPanelProps {
  kind: 'changed' | 'deleted'
  /** kind=changed 时的远端正文（源文，只读预览） */
  remoteContent?: string
  busy?: boolean
  error?: string | null
  onOverwrite: () => void
  onDiscard: () => void
  onCancel: () => void
}

/** 两种冲突的文案集中一处，避免同一 kind 的四段条件分支散落。 */
const KIND_TEXT = {
  changed: {
    title: '远端文件已更新',
    hint: '你开始编辑后，仓库里的这个文件已经变了。保存被拒绝，请选择使用哪一边。',
    overwrite: '覆盖远端'
  },
  deleted: {
    title: '远端文件已被删除',
    hint: '你开始编辑后，仓库里的这个文件已被删除。可以按你的草稿重新创建，或放弃草稿。',
    overwrite: '在远端重新创建'
  }
} as const

export function ConflictPanel({
  kind,
  remoteContent,
  busy = false,
  error = null,
  onOverwrite,
  onDiscard,
  onCancel
}: ConflictPanelProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const text = KIND_TEXT[kind]

  return (
    <div class="conflict" role="dialog" aria-modal="true" aria-label="回写冲突">
      <div class="conflict__box">
        <h2 class="conflict__title">{text.title}</h2>
        <p class="conflict__hint">{text.hint}</p>

        {kind === 'changed' && (
          <pre class="conflict__remote" aria-label="远端版本预览">
            {remoteContent ?? ''}
          </pre>
        )}

        {error && <p class="conflict__error">{error}</p>}

        {confirmDiscard ? (
          <div class="conflict__actions">
            <span class="conflict__hint">确定放弃手机上的修改？草稿会被删除。</span>
            <button
              type="button"
              class="btn btn--danger"
              disabled={busy}
              onClick={onDiscard}
            >
              确定放弃
            </button>
            <button
              type="button"
              class="btn"
              disabled={busy}
              onClick={() => setConfirmDiscard(false)}
            >
              取消
            </button>
          </div>
        ) : (
          <div class="conflict__actions">
            <button
              type="button"
              class="btn btn--primary"
              disabled={busy}
              onClick={onOverwrite}
            >
              {busy ? '处理中…' : text.overwrite}
            </button>
            <button
              type="button"
              class="btn btn--danger"
              disabled={busy}
              onClick={() => setConfirmDiscard(true)}
            >
              放弃我的修改
            </button>
            <button
              type="button"
              class="btn"
              disabled={busy}
              onClick={onCancel}
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
