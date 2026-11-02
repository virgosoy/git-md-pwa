import { useEffect, useState } from 'preact/hooks'
import { SettingsView } from './settings/SettingsView'
import type { AppSettings } from './settings/store'
import { isConfigured, loadSettings } from './settings/store'

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadSettings().then(setSettings)
  }, [])

  const configured = settings != null && isConfigured(settings)

  return (
    <div class="app">
      <header class="app__header">
        <h1 class="app__title">MD 镜像</h1>
        <button class="btn" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? '收起' : '设置'}
        </button>
      </header>
      <main class="app__main">
        {showSettings || settings == null ? (
          <SettingsView
            onClose={() => setShowSettings(false)}
            onSaved={() => loadSettings().then(setSettings)}
          />
        ) : configured ? (
          <div class="welcome">
            <p class="app__hint">
              已配置：<strong>
                {settings.owner}/{settings.repo}
              </strong>
              {settings.autoSync ? ' · 自动同步开' : ' · 自动同步关'}
            </p>
            <p class="app__hint">阅读器在票 02/03 实现，先到这里。</p>
          </div>
        ) : (
          <p class="app__hint">尚未配置仓库，点右上角「设置」开始。</p>
        )}
      </main>
    </div>
  )
}
