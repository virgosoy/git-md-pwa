import { useEffect, useRef, useState } from 'preact/hooks'
import { SettingsView } from './settings/SettingsView'
import type { AppSettings } from './settings/store'
import { isConfigured, loadSettings } from './settings/store'
import { getFile } from './mirror/store'
import { loadReading, listRecent, recordOpen, saveScroll } from './reader/reading'
import type { ReadingRecord } from './reader/reading'
import { ReaderView } from './reader/ReaderView'

interface OpenNote {
  path: string
  content: string
  scrollTop: number
}

/** 滚动位置写入的 trailing debounce，避免每个滚动 tick 都写 IDB */
const SCROLL_SAVE_DELAY = 300

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [recent, setRecent] = useState<ReadingRecord[]>([])
  const [current, setCurrent] = useState<OpenNote | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const scrollTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s)
      if (isConfigured(s)) void refreshRecent()
    })
  }, [])

  async function refreshRecent(): Promise<void> {
    setRecent(await listRecent(20))
  }

  async function openNote(path: string): Promise<void> {
    const file = await getFile(path)
    if (!file || file.status !== 'ok') {
      setNotice(`「${path}」尚未镜像（超过 10MB 或尚未同步），暂时打不开。`)
      return
    }
    setNotice(null)
    const reading = await loadReading(path)
    setCurrent({ path, content: file.content, scrollTop: reading?.scrollTop ?? 0 })
    await recordOpen(path)
    await refreshRecent()
  }

  function handleScroll(scrollTop: number): void {
    if (!current) return
    if (scrollTimer.current !== undefined) clearTimeout(scrollTimer.current)
    scrollTimer.current = (setTimeout(() => {
      void saveScroll(current.path, scrollTop)
    }, SCROLL_SAVE_DELAY) as unknown) as number
  }

  const configured = settings != null && isConfigured(settings)

  return (
    <div class="app">
      <header class="app__header">
        {current ? (
          <>
            <button class="btn" onClick={() => setCurrent(null)}>
              ‹ 返回
            </button>
            <h1 class="app__title app__title--trunc">{current.path}</h1>
          </>
        ) : (
          <>
            <h1 class="app__title">MD 镜像</h1>
            <button class="btn" onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? '收起' : '设置'}
            </button>
          </>
        )}
      </header>

      <main class={current ? 'app__main app__main--flush' : 'app__main'}>
        {current ? (
          <ReaderView
            key={current.path}
            path={current.path}
            content={current.content}
            initialScrollTop={current.scrollTop}
            onOpenNote={(p) => void openNote(p)}
            onScroll={handleScroll}
          />
        ) : settings == null ? (
          <p class="app__hint">载入中…</p>
        ) : showSettings || !configured ? (
          <SettingsView
            onClose={() => setShowSettings(false)}
            onSaved={() => loadSettings().then(setSettings)}
          />
        ) : recent.length === 0 ? (
          <div class="welcome">
            <p class="app__hint">还没有打开过笔记。</p>
            <p class="app__hint">
              镜像来自本地 IndexedDB；「同步」能力在票 04，真机联调时启用。
            </p>
          </div>
        ) : (
          <nav class="recent">
            <h2 class="recent__title">最近打开</h2>
            <ul class="recent__list">
              {recent.map((r) => (
                <li key={r.path}>
                  <button class="recent__item" onClick={() => void openNote(r.path)}>
                    {r.path}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>

      {notice && !current && (
        <div class="notice" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}
