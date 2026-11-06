import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { SettingsView } from './settings/SettingsView'
import type { AppSettings } from './settings/store'
import { isConfigured, loadSettings } from './settings/store'
import { getFile, loadFiles } from './mirror/store'
import type { StoredFile } from './mirror/store'
import { NotesList } from './notes/NotesList'
import { buildIndex, searchHeadings } from './search'
import { SearchResults } from './search/SearchResults'
import { loadReading, listRecent, recordOpen, saveScroll } from './reader/reading'
import type { ReadingRecord } from './reader/reading'
import { ReaderView } from './reader/ReaderView'
import { createGithubClient } from './github/client'
import { loadMirrorMeta } from './mirror/store'
import { runSync } from './sync/sync'
import type { SyncFailKind } from './sync/sync'
import { SyncBanner } from './sync/SyncBanner'

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

  // 同步状态（票 04）
  const settingsRef = useRef<AppSettings | null>(null)
  settingsRef.current = settings
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'failed'>('synced')
  const [syncFail, setSyncFail] = useState<{ kind: SyncFailKind; message: string } | null>(
    null
  )
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [files, setFiles] = useState<StoredFile[]>([])
  const [query, setQuery] = useState('')

  // 标题索引：内容变化才重算（591 篇×正文解析，不同步不重复跑）
  const index = useMemo(() => buildIndex(files), [files])
  const hits = useMemo(() => searchHeadings(index, query), [index, query])

  useEffect(() => {
    loadSettings()
      .then((s) => {
        setSettings(s)
        settingsRef.current = s
        if (isConfigured(s)) {
          void refreshRecent()
          void loadMirrorMeta()
            .then((m) => {
              if (m) setLastSyncedAt(m.syncedAt)
            })
            .catch(() => {})
          void refreshFiles()
          void runSyncTask(s, false)
        }
      })
      .catch(() => {})
  }, [])

  async function refreshFiles(): Promise<void> {
    try {
      setFiles(await loadFiles())
    } catch {
      // 忽略列表加载失败
    }
  }

  /** 执行一次同步（force 会无视同步开关） */
  async function runSyncTask(s: AppSettings | null, force: boolean): Promise<void> {
    if (!s || !isConfigured(s)) return
    // 开关守门：非强制且 autoSync 关闭则完全不请求网络
    if (!force && !s.autoSync) return
    setSyncStatus('syncing')
    const outcome = await runSync(createGithubClient(s.token), {
      owner: s.owner,
      repo: s.repo
    })
    if (outcome.status === 'synced') {
      setSyncFail(null)
      setLastSyncedAt(Date.now())
      setSyncStatus('synced')
      try {
        await refreshRecent()
        await refreshFiles()
      } catch {
        // 列表刷新失败不影响同步结果
      }
    } else {
      setSyncFail({ kind: outcome.kind, message: outcome.message })
      setSyncStatus('failed')
      // 失败沿用旧镜像（02 已保证不破坏），保留上次同步时间
    }
  }

  async function doSync(force: boolean): Promise<void> {
    await runSyncTask(settingsRef.current, force)
  }

  async function handleSettingsSaved(): Promise<void> {
    const s = await loadSettings()
    setSettings(s)
    settingsRef.current = s
    if (isConfigured(s)) {
      void refreshFiles()
      // 首次配置保存后立即同步，让首页立刻有内容
      void runSyncTask(s, false)
    }
  }

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
            <div class="app__actions">
              <button class="btn" onClick={() => void doSync(true)}>
                刷新
              </button>
              <button class="btn" onClick={() => setShowSettings((s) => !s)}>
                {showSettings ? '收起' : '设置'}
              </button>
            </div>
          </>
        )}
      </header>

      <SyncBanner status={syncStatus} fail={syncFail} lastSyncedAt={lastSyncedAt} />

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
            onSaved={() => void handleSettingsSaved()}
          />
        ) : recent.length === 0 && files.length === 0 ? (
          <div class="welcome">
            <p class="app__hint">
              还没有笔记。右上「刷新」同步你的私有仓库（需在设置里填好令牌）。
            </p>
          </div>
        ) : (
          <div class="home">
            <input
              class="search-input"
              type="search"
              placeholder="搜索标题 / 文件名"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
            {query.trim() ? (
              <SearchResults hits={hits} onOpen={(p) => void openNote(p)} />
            ) : (
              <>
                {recent.length > 0 && (
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
                {files.length > 0 && (
                  <>
                    <h2 class="recent__title">全部笔记（{files.length}）</h2>
                    <NotesList files={files} onOpen={(p) => void openNote(p)} />
                  </>
                )}
              </>
            )}
          </div>
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
