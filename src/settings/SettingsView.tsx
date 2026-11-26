import { useEffect, useState } from 'preact/hooks'
import type { AppSettings } from './store'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './store'
import type { ThemeMode } from '../theme/theme'
import { formatAgo } from '../updates/format'
import { StorageUsage } from '../storage/StorageUsage'

/** AppSettings 中的布尔开关键（bindCheck 只对这些键开放） */
type BooleanKey = { [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never }[keyof AppSettings]

export interface SettingsViewProps {
  onClose: () => void
  onSaved?: () => void
  /** 当前构建版本串（来自 useUpdate，经 vite define 注入） */
  appVersion?: string
  lastCheckedAt?: number | null
  checking?: boolean
  latestNote?: string | null
  onCheckUpdates?: () => void
  /** 同步进行中（传给本机存储区块，禁用清空镜像） */
  syncing?: boolean
  /** 笔记镜像被清空后通知 App 刷新列表 / 最近 / 同步横幅 */
  onMirrorCleared?: () => void
  /** 本机未提交草稿数（关闭回写时提示草稿不会被删除） */
  draftCount?: number
}

export function SettingsView({
  onClose,
  onSaved,
  appVersion,
  lastCheckedAt,
  checking = false,
  latestNote = null,
  onCheckUpdates,
  syncing = false,
  onMirrorCleared,
  draftCount = 0
}: SettingsViewProps) {
  const [form, setForm] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings().then((s) => {
      setForm(s)
      setLoaded(true)
    })
  }, [])

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSaved(false)
    setForm((f) => ({ ...f, [key]: value }))
  }

  function bindText<K extends keyof AppSettings>(key: K) {
    return (e: Event) => set(key, (e.target as HTMLInputElement).value as AppSettings[K])
  }

  function bindCheck<K extends BooleanKey>(key: K) {
    return (e: Event) => set(key, (e.target as HTMLInputElement).checked as AppSettings[K])
  }

  async function onSubmit(e: Event) {
    e.preventDefault()
    await saveSettings(form)
    setSaved(true)
    onSaved?.()
  }

  return (
    <form class="settings" onSubmit={onSubmit}>
      <h2 class="settings__title">设置</h2>

      <label class="field">
        <span class="field__label">细粒度令牌（只读 / 读写）</span>
        <input
          class="field__input"
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder="github_pat_…"
          value={form.token}
          disabled={!loaded}
          onInput={bindText('token')}
        />
        <span class="field__hint">
          只存在本机；私有仓库必须填。阅读只需 Contents: Read，回写需要 Read and write；公开仓库可不填。
        </span>
      </label>

      <label class="field">
        <span class="field__label">仓库</span>
        <div class="field__repo">
          <input
            class="field__input"
            placeholder="owner"
            spellcheck={false}
            value={form.owner}
            disabled={!loaded}
            onInput={bindText('owner')}
          />
          <span class="field__slash">/</span>
          <input
            class="field__input"
            placeholder="repo"
            spellcheck={false}
            value={form.repo}
            disabled={!loaded}
            onInput={bindText('repo')}
          />
        </div>
      </label>

      <label class="field">
        <span class="field__label">主题</span>
        <select
          class="field__input"
          aria-label="主题"
          value={form.theme}
          disabled={!loaded}
          onChange={(e) =>
            set('theme', (e.target as HTMLSelectElement).value as ThemeMode)
          }
        >
          <option value="dark">深色（默认）</option>
          <option value="light">浅色</option>
          <option value="system">跟随系统</option>
        </select>
        <span class="field__hint">浅色适合白天；跟随系统会随 iPhone 的外观设置切换。</span>
      </label>

      <label class="field field--row">
        <input
          type="checkbox"
          checked={form.autoSync}
          disabled={!loaded}
          onChange={bindCheck('autoSync')}
        />
        <span>打开 App 时自动同步（默认勾选）</span>
      </label>

      <label class="field field--row">
        <input
          type="checkbox"
          checked={form.autoDownloadAssets}
          disabled={!loaded}
          onChange={bindCheck('autoDownloadAssets')}
        />
        <span>
          打开笔记时自动下载图片与附件资源（默认勾选；关闭后只显示已缓存资源，点单个或「全下」再下载）
        </span>
      </label>

      <label class="field field--row">
        <input
          type="checkbox"
          checked={form.writeBackEnabled}
          disabled={!loaded}
          onChange={bindCheck('writeBackEnabled')}
        />
        <span>
          回写：允许在手机上编辑笔记并提交回仓库（默认关闭；需要 Contents: Read and write 的令牌）
        </span>
      </label>
      {!form.writeBackEnabled && draftCount > 0 && (
        <p class="field__hint">
          本机有 {draftCount} 份未提交草稿；关闭回写不会删除它们，再次开启可继续。
        </p>
      )}

      <label class="field field--row">
        <input
          type="checkbox"
          checked={form.renderMath}
          disabled={!loaded}
          onChange={bindCheck('renderMath')}
        />
        <span>渲染数学公式（KaTeX，默认关闭；关或写错时当普通文本）</span>
      </label>

      <label class="field field--row">
        <input
          type="checkbox"
          checked={form.renderMermaid}
          disabled={!loaded}
          onChange={bindCheck('renderMermaid')}
        />
        <span>渲染 Mermaid 图表（默认关闭；关或写错时显示代码块）</span>
      </label>

      <label class="field field--row">
        <input
          type="checkbox"
          checked={form.betterHeadingExtract}
          disabled={!loaded}
          onChange={bindCheck('betterHeadingExtract')}
        />
        <span>检索用渲染器语义提取标题（默认开启；引号/列表内的标题也能搜到。若手机端较慢可关回旧算法）</span>
      </label>

      {onCheckUpdates && (
        <div class="field">
          <span class="field__label">应用版本与更新</span>
          <div class="settings__update">
            <span class="field__hint">
              版本 {appVersion ?? '—'} · 上次检查 {formatAgo(lastCheckedAt, Date.now())}
            </span>
            <button type="button" class="btn" onClick={onCheckUpdates} disabled={checking}>
              {checking ? '检查中…' : '检查更新'}
            </button>
          </div>
          {latestNote && <p class="settings__saved">{latestNote}</p>}
        </div>
      )}

      <StorageUsage syncing={syncing} onMirrorCleared={onMirrorCleared} />

      <div class="settings__actions">
        <button type="submit" class="btn btn--primary" disabled={!loaded}>
          保存
        </button>
        <button type="button" class="btn" onClick={onClose}>
          返回
        </button>
      </div>
      {saved && <p class="settings__saved">已保存（存在本机）</p>}
    </form>
  )
}
