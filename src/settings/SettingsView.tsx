import { useEffect, useState } from 'preact/hooks'
import type { AppSettings } from './store'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './store'

export interface SettingsViewProps {
  onClose: () => void
  onSaved?: () => void
}

export function SettingsView({ onClose, onSaved }: SettingsViewProps) {
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

  function bindCheck(key: 'autoSync') {
    return (e: Event) => set(key, (e.target as HTMLInputElement).checked)
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
        <span class="field__label">细粒度只读令牌（PAT）</span>
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
        <span class="field__hint">只存在本机；给单个私有仓库开只读权限即可。</span>
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

      <label class="field field--row">
        <input
          type="checkbox"
          checked={form.autoSync}
          disabled={!loaded}
          onChange={bindCheck('autoSync')}
        />
        <span>打开 App 时自动同步（默认勾选）</span>
      </label>

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
