// 回写编辑器：全屏源文编辑 + 预览切换。
// 预览直接复用 ReaderView（不装 TOC），保持与阅读器一致的 Markdown/代码高亮/资源行为。

import { useState } from 'preact/hooks'
import { ReaderView } from '../reader/ReaderView'
import type { AssetLoader } from '../assets/wire'
import type { ResolvedTheme } from '../theme/theme'

export interface EditorViewProps {
  path: string
  /** LF 文本（textarea 的规范形式）；保存时由 App 按原文件行尾还原 */
  value: string
  /** 保存进行中：源文只读，避免提交中的内容被改坏 */
  saving?: boolean
  onInput: (value: string) => void
  onDiscard: () => void
  assetLoader?: AssetLoader | null
  autoDownloadAssets?: boolean
  renderMath?: boolean
  renderMermaid?: boolean
  theme?: ResolvedTheme
}

export function EditorView({
  path,
  value,
  saving = false,
  onInput,
  onDiscard,
  assetLoader,
  autoDownloadAssets = true,
  renderMath = false,
  renderMermaid = false,
  theme = 'dark'
}: EditorViewProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  return (
    <div class="editor">
      <div class="editor__bar">
        <div class="editor__seg" role="group" aria-label="编辑或预览">
          <button
            type="button"
            class={mode === 'edit' ? 'is-active' : ''}
            aria-pressed={mode === 'edit'}
            onClick={() => setMode('edit')}
          >
            编辑
          </button>
          <button
            type="button"
            class={mode === 'preview' ? 'is-active' : ''}
            aria-pressed={mode === 'preview'}
            onClick={() => setMode('preview')}
          >
            预览
          </button>
        </div>
        <button
          type="button"
          class="btn editor__discard"
          disabled={saving}
          onClick={() => setConfirmDiscard(true)}
        >
          丢弃草稿
        </button>
      </div>

      <p class="editor__hint">编辑内容自动存为本机草稿；「保存」会立即提交到仓库。</p>

      {confirmDiscard && (
        <div class="editor__confirm" role="alert">
          <span>确定丢弃本机草稿？已提交到仓库的内容不受影响。</span>
          <div class="editor__confirm-actions">
            <button
              type="button"
              class="btn btn--danger"
              onClick={() => {
                setConfirmDiscard(false)
                onDiscard()
              }}
            >
              确定丢弃
            </button>
            <button type="button" class="btn" onClick={() => setConfirmDiscard(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {mode === 'edit' ? (
        <textarea
          class="editor__text"
          aria-label="Markdown 源文"
          spellcheck={false}
          readOnly={saving}
          value={value}
          onInput={(e) => onInput((e.currentTarget as HTMLTextAreaElement).value)}
        />
      ) : (
        <div class="editor__preview">
          <ReaderView
            path={path}
            content={value}
            showToc={false}
            assetLoader={assetLoader}
            autoDownloadAssets={autoDownloadAssets}
            renderMath={renderMath}
            renderMermaid={renderMermaid}
            theme={theme}
            onOpenNote={() => {}}
          />
        </div>
      )}
    </div>
  )
}
