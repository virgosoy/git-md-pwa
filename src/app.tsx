import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { SettingsView } from './settings/SettingsView'
import type { AppSettings } from './settings/store'
import { isConfigured, loadSettings, saveSettings } from './settings/store'
import { getFile, loadFiles, upsertFile } from './mirror/store'
import type { StoredFile } from './mirror/store'
import { EditorView } from './editor/EditorView'
import { ConflictPanel } from './write/ConflictPanel'
import { NewNotePanel } from './write/NewNotePanel'
import { classifyWriteError } from './write/errors'
import { createNote, submitNote } from './write/submit'
import { deriveDirectories, joinNotePath, normalizeFileName } from './write/newNote'
import { applyEol, detectEol, stripBom, toLf } from './lib/eol'
import type { Eol } from './lib/eol'
import {
  DRAFT_SAVE_DELAY_MS,
  MAX_EDIT_BYTES,
  deleteDraft,
  listDraftPaths,
  loadDraft,
  saveDraft
} from './write/draft'
import type { DraftRecord } from './write/draft'
import { NotesList } from './notes/NotesList'
import { buildIndex, searchNotes } from './search'
import type { HeadingAnchor } from './search'
import { SearchResults } from './search/SearchResults'
import { ensureAsset, cachedAsset } from './assets/pipeline'
import type { AssetLoader } from './assets/wire'
import { assetRefsFromHtml } from './assets/extract'
import { renderNote } from './reader/render'
import { loadReading, listRecent, recordOpen, saveScroll } from './reader/reading'
import type { ReadingRecord } from './reader/reading'
import { ReaderView } from './reader/ReaderView'
import { createGithubClient } from './github/client'
import type { GithubClient, Repository } from './github/client'
import { loadMirrorMeta } from './mirror/store'
import { runSync } from './sync/sync'
import type { SyncFailKind } from './sync/sync'
import { SyncBanner } from './sync/SyncBanner'
import { UpdateBanner } from './updates/UpdateBanner'
import { useUpdate } from './updates/useUpdate'
import { applyThemeToDocument, rememberThemeMode, resolveTheme } from './theme/theme'
import type { ResolvedTheme } from './theme/theme'

interface OpenNote {
  path: string
  content: string
  scrollTop: number
  /** 21 · 打开后跳到的标题锚点（主页搜索结果点标题行） */
  anchor?: HeadingAnchor
  /** 镜像 blob sha（回写提交的前置条件） */
  sha: string
}

/** 回写编辑器状态（正文为 textarea 的 LF 形式） */
interface EditorState {
  path: string
  content: string
  /** 可确知的基准正文（LF）；草稿基于更早版本时为 null（必定视为有改动） */
  baseContent: string | null
  baseSha: string
  eol: Eol
}

/** 保存冲突：远端已变化或已删除 */
interface ConflictState {
  kind: 'changed' | 'deleted'
  remoteSha?: string
  remoteContent?: string
  busy: boolean
  error: string | null
}

interface WriteTarget {
  client: GithubClient
  repo: Repository
}

/** 滚动位置写入的 trailing debounce，避免每个滚动 tick 都写 IDB */
const SCROLL_SAVE_DELAY = 300

/** notice 自动消失时长（票 21：阅读器里也会出现，不再常驻） */
const NOTICE_AUTO_DISMISS_MS = 4000

/** 「全下」逐项回填的防抖间隔（票 24：多个资源同时落地只重建一次 shadow） */
const ASSET_REFRESH_DEBOUNCE_MS = 300

/** 新建失败文案：403/网络用固定提示，401 与其它沿用分类后的 message。 */
function createFailureMessage(err: unknown): string {
  const failure = classifyWriteError(err)
  if (failure.kind === 'forbidden' || failure.kind === 'auth') return failure.message
  if (failure.kind === 'network') return '新建失败，需要联网后再试'
  return err instanceof Error && err.message ? err.message : '新建失败，请稍后再试'
}

export function App() {
  const updates = useUpdate()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  // 25 · 解析后的主题：根节点属性给全局 CSS，传给阅读器换代码高亮配色
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark')
  const [showSettings, setShowSettings] = useState(false)
  const [recent, setRecent] = useState<ReadingRecord[]>([])
  const [current, setCurrent] = useState<OpenNote | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [draftPaths, setDraftPaths] = useState<ReadonlySet<string>>(new Set())
  const [currentDraft, setCurrentDraft] = useState<DraftRecord | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  // 27 · 新建笔记弹层（入口只在本页顶栏；失败保留弹层与输入）
  const [newNoteOpen, setNewNoteOpen] = useState(false)
  const [newNoteBusy, setNewNoteBusy] = useState(false)
  const [newNoteError, setNewNoteError] = useState<string | null>(null)
  const draftTimer = useRef<number | null>(null)
  const readerScrollRef = useRef(0)
  const editorRef = useRef<EditorState | null>(null)
  editorRef.current = editor
  // 同步守卫：状态更新是异步的，双击可能在重渲染前再次进入提交
  const savingRef = useRef(false)
  const conflictBusyRef = useRef(false)
  // 新建的防重入守卫与「本次会话记住上次目录」（不写入设置）
  const newNoteBusyRef = useRef(false)
  const lastNewNoteDir = useRef('/')
  const scrollTimer = useRef<number | undefined>(undefined)
  const mainRef = useRef<HTMLElement>(null)
  // 主页搜索的滚动位置管理（列表与结果共用 .app__main 这一个滚动容器）：
  // - 空 → 有查询：结果从头看（回顶），同时记住进搜索前的列表位置；
  // - 有查询 → 空：清空/× 后回到那个列表位置；
  // - 非空 → 非空（结果里增删字）：保持不动。
  const prevQueryEmpty = useRef(true)
  // 进搜索前的列表 scrollTop；必须在渲染切换前于 onInput 里捕获（结果列表更短，切换后会被夹小）
  const listScrollTop = useRef(0)
  // 22 · 离开首页进阅读器时的 .app__main 滚动位置：
  // 首页列表与阅读器共用这一个滚动容器，阅读器 flush 布局会把主容器夹到 0；
  // 返回首页时按此值像素级还原（阅读中内链切篇不覆盖，保住最初离开首页的位置）。
  const homeScrollTop = useRef(0)
  const prevCurrent = useRef<OpenNote | null>(null)
  useLayoutEffect(() => {
    const wasReading = prevCurrent.current != null
    prevCurrent.current = current
    if (wasReading && current == null && mainRef.current) {
      mainRef.current.scrollTop = homeScrollTop.current
    }
  }, [current])

  // 26 · 切后台/页面关闭前立即落草稿：500ms 防抖窗口内也可能被 iOS 挂起
  useEffect(() => {
    function flushDraftNow(): void {
      const ed = editorRef.current
      if (!ed) return
      if (draftTimer.current != null) {
        window.clearTimeout(draftTimer.current)
        draftTimer.current = null
      }
      void persistDraft(ed).catch(() => {})
    }
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') flushDraftNow()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushDraftNow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushDraftNow)
    }
  }, [])

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
  // 新建弹层的目录只从既有镜像推导（根目录固定首项）
  const newNoteDirs = useMemo(() => deriveDirectories(files), [files])

  // 标题+正文索引：内容或标题抽取模式（票 15 开关）变化才重算（591 篇×正文解析，不同步不重复跑）
  const index = useMemo(
    () => buildIndex(files, settings?.betterHeadingExtract === false ? 'regex' : 'token'),
    [files, settings?.betterHeadingExtract]
  )
  const hits = useMemo(() => searchNotes(index, query), [index, query])
  const [readerTick, setReaderTick] = useState(0)
  // 24 · 「全下」进行中：按钮置灰并显示「下载中…」。状态带笔记路径 + 批次序号：
  // 切走笔记后旧批次不再影响新笔记（不能用会与点击竞速的 path effect 来重置）。
  const [downloadingAssets, setDownloadingAssets] = useState<{
    path: string
    seq: number
  } | null>(null)
  const downloadSeq = useRef(0)
  const assetRefreshTimer = useRef<number | null>(null)
  const currentPathRef = useRef<string | null>(null)
  currentPathRef.current = current?.path ?? null

  useEffect(() => {
    return () => {
      if (assetRefreshTimer.current != null) {
        window.clearTimeout(assetRefreshTimer.current)
        assetRefreshTimer.current = null
      }
    }
  }, [])

  useEffect(() => {
    const nowEmpty = query.trim() === ''
    const main = mainRef.current
    if (!nowEmpty && prevQueryEmpty.current) {
      // 空 → 有查询：结果从头看
      if (main) main.scrollTop = 0
    } else if (nowEmpty && !prevQueryEmpty.current) {
      // 有查询 → 空：回到进入搜索前的列表位置
      if (main) main.scrollTop = listScrollTop.current
    }
    // 非空 → 非空（结果里增删字）：保持位置不动
    prevQueryEmpty.current = nowEmpty
  }, [query])

  // 21：notice 在阅读器里也会显示（不再只在首页），统一自动消失，避免常驻遮挡正文
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notice])

  /** 搜索框输入：进搜索前先记住列表位置（渲染切换后再读会被浏览器夹小） */
  function handleQueryInput(e: Event): void {
    const next = (e.target as HTMLInputElement).value
    if (query.trim() === '' && next.trim() !== '') {
      listScrollTop.current = mainRef.current?.scrollTop ?? 0
    }
    setQuery(next)
  }
  // 资源加载器：图/PDF 按需拉取（先查缓存再网络，缓存为 dataURL）。
  // 依赖只收敛到 token/owner/repo：这三者变化才重建 reader（开关类设置改了不应重装资源/重建 shadow）。
  const { token: assetToken, owner: assetOwner, repo: assetRepo } = settings ?? {}
  const assetLoader = useMemo<AssetLoader | null>(() => {
    // 未配置（owner/repo 空）→ 无加载器；token 可为空串（公开库匿名只读）
    if (!assetOwner || !assetRepo) return null
    const client = createGithubClient(assetToken ?? '')
    const repo = { owner: assetOwner, repo: assetRepo }
    return { load: (p) => ensureAsset(client, repo, p), cached: (p) => cachedAsset(p) }
  }, [assetToken, assetOwner, assetRepo])

  /** 24 · 下载中按防抖触发回填：多个资源同时落地时只重建一次 shadow。 */
  function scheduleAssetRefresh(path: string, seq: number): void {
    if (assetRefreshTimer.current != null) return
    assetRefreshTimer.current = window.setTimeout(() => {
      assetRefreshTimer.current = null
      // 切走笔记 / 又点了一次「全下」：旧批次不再驱动当前笔记重建
      if (seq === downloadSeq.current && currentPathRef.current === path) {
        setReaderTick((t) => t + 1)
      }
    }, ASSET_REFRESH_DEBOUNCE_MS)
  }

  async function downloadNoteAssets(): Promise<void> {
    if (!current || !assetLoader) return
    const { path, content } = current
    const refs = assetRefsFromHtml(renderNote(content), path)
    if (refs.length === 0) return
    const seq = ++downloadSeq.current
    setDownloadingAssets({ path, seq })
    try {
      // 24：每个资源独立落地就回填，不等最慢的；失败项保持「未下载」可重试
      await Promise.all(
        refs.map(async (r) => {
          await assetLoader!.load(r.path).catch(() => null)
          if (seq === downloadSeq.current) scheduleAssetRefresh(path, seq)
        })
      )
    } finally {
      if (seq === downloadSeq.current) {
        // 最后一批可能还在防抖窗口内：清掉并立刻刷一次，保证按钮复原时已回填
        if (assetRefreshTimer.current != null) {
          window.clearTimeout(assetRefreshTimer.current)
          assetRefreshTimer.current = null
        }
        setDownloadingAssets((s) => (s?.seq === seq ? null : s))
        if (currentPathRef.current === path) setReaderTick((t) => t + 1)
      }
    }
  }

  useEffect(() => {
    loadSettings()
      .then((s) => {
        setSettings(s)
        settingsRef.current = s
        void refreshDraftPaths()
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

  // 主题：设置模式（含跟随系统）→ <html data-theme> + meta theme-color。
  // system 时监听系统偏好变化实时切换；light/dark 固定，不依赖系统。
  useEffect(() => {
    const mode = settings?.theme
    if (!mode) return
    // 同步镜像给 index.html 内联脚本，冷启动首屏就能用对主题
    rememberThemeMode(mode)
    const mql =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: light)')
        : null
    const apply = (): void => {
      const next = resolveTheme(mode, mql?.matches ?? false)
      setResolvedTheme(next)
      applyThemeToDocument(next)
    }
    apply()
    if (mode !== 'system' || !mql) return
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [settings?.theme])

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
    void refreshDraftPaths()
    void refreshCurrentDraft(currentPathRef.current)
    if (isConfigured(s)) {
      void refreshFiles()
      // 首次配置保存后立即同步，让首页立刻有内容
      void runSyncTask(s, false)
    }
  }

  async function handleTocPinChange(pinned: boolean): Promise<void> {
    // TOC 固定偏好随设置持久化（全局，跨笔记/会话）
    const s = await saveSettings({ tocPinned: pinned })
    setSettings(s)
    settingsRef.current = s
  }

  /** 笔记镜像被清空：复位同步横幅与首页列表 / 最近 / 搜索（票 19）。 */
  async function handleMirrorCleared(): Promise<void> {
    setLastSyncedAt(null)
    setSyncFail(null)
    setQuery('')
    await refreshFiles()
    try {
      await refreshRecent()
    } catch {
      // 最近列表刷新失败不影响清空结果
    }
    await refreshDraftPaths()
    setCurrentDraft(null)
  }

  async function refreshRecent(): Promise<void> {
    setRecent(await listRecent(20))
  }

  // ── 26 · 回写：草稿、编辑器、提交与冲突 ───────────────────────────────

  async function refreshDraftPaths(): Promise<void> {
    try {
      setDraftPaths(new Set(await listDraftPaths()))
    } catch {
      // 草稿表读取失败不影响阅读
    }
  }

  async function refreshCurrentDraft(path: string | null): Promise<void> {
    if (!path) {
      setCurrentDraft(null)
      return
    }
    try {
      setCurrentDraft((await loadDraft(path)) ?? null)
    } catch {
      setCurrentDraft(null)
    }
  }

  function clearDraftTimer(): void {
    if (draftTimer.current != null) {
      window.clearTimeout(draftTimer.current)
      draftTimer.current = null
    }
  }

  function editorDirty(ed: EditorState): boolean {
    return ed.baseContent === null || toLf(ed.content) !== ed.baseContent
  }

  async function persistDraft(ed: EditorState): Promise<void> {
    if (ed.baseContent !== null && toLf(ed.content) === ed.baseContent) {
      await deleteDraft(ed.path)
    } else {
      await saveDraft({
        path: ed.path,
        content: toLf(ed.content),
        baseSha: ed.baseSha,
        eol: ed.eol,
        updatedAt: Date.now()
      })
    }
  }

  function currentWriteTarget(): WriteTarget | null {
    if (!settings || !settings.token || !settings.owner || !settings.repo) return null
    return {
      client: createGithubClient(settings.token),
      repo: { owner: settings.owner, repo: settings.repo }
    }
  }

  // ── 27 · 新建笔记 ─────────────────────────────────────────────────────

  function openNewNote(): void {
    setNewNoteError(null)
    setNewNoteOpen(true)
  }

  function closeNewNote(): void {
    if (newNoteBusyRef.current) return
    setNewNoteOpen(false)
    setNewNoteError(null)
  }

  /** 创建成功后：回填镜像、刷新列表、清搜索词，然后直接进编辑器（不整树同步）。 */
  async function afterCreated(path: string, sha: string): Promise<void> {
    try {
      await upsertFile({ path, sha, content: '', size: 0, status: 'ok' })
    } catch {
      // 本地回填失败不阻断创建结果；下次同步按 sha 校准
    }
    // 与 openNote 一致：离开首页时记住列表滚动位置
    homeScrollTop.current = mainRef.current?.scrollTop ?? 0
    setNewNoteOpen(false)
    setNewNoteError(null)
    setQuery('')
    setNotice(null)
    setFindOpen(false)
    setCurrent({ path, content: '', scrollTop: 0, sha })
    setEditor({ path, content: '', baseContent: '', baseSha: sha, eol: 'lf' })
    // 最近打开/列表/草稿状态都属于本地附属信息：失败不影响已创建的结果
    await Promise.all([
      refreshFiles(),
      recordOpen(path).then(refreshRecent).catch(() => {}),
      refreshCurrentDraft(path)
    ])
  }

  async function handleCreateNote(dir: string, rawName: string): Promise<void> {
    if (newNoteBusyRef.current) return
    const normalized = normalizeFileName(rawName)
    if (normalized.error != null || normalized.name === '') {
      setNewNoteError(normalized.error ?? '请填写文件名')
      return
    }
    const path = joinNotePath(dir, normalized.name)
    newNoteBusyRef.current = true
    setNewNoteBusy(true)
    setNewNoteError(null)
    try {
      // 本地镜像已有同 path：不发请求
      let existing: StoredFile | undefined
      try {
        existing = await getFile(path)
      } catch {
        setNewNoteError('读取本机镜像失败，请稍后再试')
        return
      }
      if (existing) {
        setNewNoteError('已存在同名笔记')
        return
      }
      const target = currentWriteTarget()
      if (!target) {
        setNewNoteError('请先在设置里填写令牌与仓库')
        return
      }
      lastNewNoteDir.current = dir
      try {
        const result = await createNote(target.client, target.repo, path)
        await afterCreated(path, result.sha)
      } catch (err) {
        // 409/422：GET 确认远端是否已存在；存在则按重名提示，不覆盖、不自动改名
        if (classifyWriteError(err).kind === 'conflict') {
          try {
            await target.client.getFileContent(target.repo, path)
            setNewNoteError('已存在同名笔记')
          } catch {
            setNewNoteError(createFailureMessage(err))
          }
          return
        }
        setNewNoteError(createFailureMessage(err))
      }
    } finally {
      newNoteBusyRef.current = false
      setNewNoteBusy(false)
    }
  }

  function handleEditorInput(text: string): void {
    const ed = editor
    if (!ed) return
    const next = { ...ed, content: text }
    setEditor(next)
    clearDraftTimer()
    draftTimer.current = window.setTimeout(() => {
      draftTimer.current = null
      void persistDraft(next)
        .then(() => refreshDraftPaths())
        .catch(() => setNotice('草稿保存失败，请勿离开页面'))
    }, DRAFT_SAVE_DELAY_MS)
  }

  async function openEditor(): Promise<void> {
    const cur = current
    if (!cur || !settings) return
    if (!settings.writeBackEnabled || !settings.token) return
    const file = await getFile(cur.path)
    if (!file || file.status !== 'ok') {
      setNotice('这篇笔记尚未镜像，暂时无法编辑')
      return
    }
    if (file.size > MAX_EDIT_BYTES) {
      setNotice('文件过大，暂不支持手机编辑')
      return
    }
    const raw = stripBom(file.content)
    const base = toLf(raw)
    const draft = await loadDraft(file.path)
    clearDraftTimer()
    setSaving(false)
    setConflict(null)
    setFindOpen(false)
    setEditor(
      draft
        ? {
            path: file.path,
            content: toLf(draft.content),
            // 草稿基于当前镜像版本时，才确知基准正文；否则视为必定有改动
            baseContent: draft.baseSha === file.sha ? base : null,
            baseSha: draft.baseSha,
            eol: draft.eol
          }
        : {
            path: file.path,
            content: base,
            baseContent: base,
            baseSha: file.sha,
            eol: detectEol(raw)
          }
    )
    // 阅读器即将卸载：把当前滚动位置带进 current，返回时按它还原
    setCurrent((c) =>
      c && c.path === file.path ? { ...c, scrollTop: readerScrollRef.current } : c
    )
  }

  async function closeEditor(): Promise<void> {
    const ed = editor
    if (!ed || savingRef.current) return
    clearDraftTimer()
    try {
      await persistDraft(ed)
    } catch {
      setNotice('草稿保存失败，请重试')
      return
    }
    setEditor(null)
    setConflict(null)
    await refreshDraftPaths()
    await refreshCurrentDraft(ed.path)
  }

  async function discardEditor(): Promise<void> {
    const ed = editor
    if (!ed || savingRef.current) return
    clearDraftTimer()
    try {
      await deleteDraft(ed.path)
    } catch {
      setNotice('丢弃草稿失败，请重试')
      return
    }
    setEditor(null)
    setConflict(null)
    await refreshDraftPaths()
    await refreshCurrentDraft(ed.path)
    setNotice('草稿已丢弃')
  }

  /** 提交/加载远端成功后：回填本地镜像与当前阅读内容；镜像写失败交给下次同步校准。 */
  async function storeLocalVersion(
    path: string,
    content: string,
    sha: string
  ): Promise<void> {
    const size = new TextEncoder().encode(content).byteLength
    try {
      await upsertFile({ path, sha, content, size, status: 'ok' })
    } catch {
      // 镜像回填失败不阻断提交结果；下次同步按 sha 校准
    }
    setCurrent((c) => (c && c.path === path ? { ...c, content, sha } : c))
  }

  async function afterSaved(
    ed: EditorState,
    newSha: string,
    contentWithEol: string
  ): Promise<void> {
    // 提交已经成功：先清草稿，避免本地写库失败导致重复提交
    await deleteDraft(ed.path).catch(() => {})
    await storeLocalVersion(ed.path, contentWithEol, newSha)
    setEditor({ ...ed, baseContent: toLf(ed.content), baseSha: newSha })
    setConflict(null)
    await refreshFiles()
    await refreshDraftPaths()
    setCurrentDraft(null)
    setNotice('已提交')
  }

  async function resolveWriteConflict(
    ed: EditorState,
    target: WriteTarget,
    fallbackMessage: string
  ): Promise<void> {
    try {
      const remote = await target.client.getFileContent(target.repo, ed.path)
      if (remote.sha === ed.baseSha) {
        // PUT 报 409/422 但远端 sha 没变：多半是校验错误而非冲突
        setConflict(null)
        setNotice(fallbackMessage)
        return
      }
      setConflict({
        kind: 'changed',
        remoteSha: remote.sha,
        remoteContent: remote.content,
        busy: false,
        error: null
      })
    } catch (err) {
      if (classifyWriteError(err).kind === 'not-found') {
        setConflict({ kind: 'deleted', busy: false, error: null })
      } else {
        setConflict(null)
        setNotice('远端版本读取失败，草稿已保留；请稍后再试')
      }
    }
  }

  async function saveEditor(): Promise<void> {
    const ed = editor
    if (!ed || savingRef.current || !editorDirty(ed)) return
    const target = currentWriteTarget()
    if (!target) {
      setNotice('请先在设置里填写令牌与仓库')
      return
    }
    savingRef.current = true
    setSaving(true)
    clearDraftTimer()
    try {
      await persistDraft(ed)
      const content = applyEol(ed.content, ed.eol)
      const result = await submitNote(target.client, target.repo, {
        path: ed.path,
        content,
        sha: ed.baseSha
      })
      await afterSaved(ed, result.sha, content)
    } catch (err) {
      const failure = classifyWriteError(err)
      if (failure.kind === 'conflict') {
        await resolveWriteConflict(ed, target, err instanceof Error ? err.message : failure.message)
      } else if (failure.kind === 'network') {
        setNotice('已存草稿，联网后再保存')
        void refreshDraftPaths()
      } else {
        setNotice(failure.message)
        void refreshDraftPaths()
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function overwriteConflict(): Promise<void> {
    const ed = editor
    const c = conflict
    if (!ed || !c || c.busy || conflictBusyRef.current) return
    const target = currentWriteTarget()
    if (!target) return
    conflictBusyRef.current = true
    setConflict({ ...c, busy: true, error: null })
    try {
      const content = applyEol(ed.content, ed.eol)
      const result = await submitNote(target.client, target.repo, {
        path: ed.path,
        content,
        sha: c.kind === 'changed' ? c.remoteSha : undefined
      })
      await afterSaved(ed, result.sha, content)
    } catch (err) {
      const failure = classifyWriteError(err)
      if (failure.kind === 'conflict') {
        await resolveWriteConflict(ed, target, err instanceof Error ? err.message : failure.message)
      } else {
        setConflict({ ...c, busy: false, error: failure.message })
      }
    } finally {
      conflictBusyRef.current = false
    }
  }

  async function discardConflict(): Promise<void> {
    const ed = editor
    const c = conflict
    if (!ed || !c || conflictBusyRef.current) return
    conflictBusyRef.current = true
    try {
      if (c.kind === 'changed' && c.remoteSha && c.remoteContent != null) {
        const remoteSha = c.remoteSha
        const remoteContent = c.remoteContent
        try {
          await deleteDraft(ed.path)
        } catch {
          setConflict({ ...c, busy: false, error: '加载远端版本失败，请重试' })
          return
        }
        await storeLocalVersion(ed.path, remoteContent, remoteSha)
        setEditor(null)
        setConflict(null)
        setCurrentDraft(null)
        await refreshFiles()
        await refreshDraftPaths()
        setNotice('已加载远端版本')
        return
      }

      try {
        await deleteDraft(ed.path)
      } catch {
        setConflict({ ...c, busy: false, error: '丢弃草稿失败，请重试' })
        return
      }
      setEditor(null)
      setConflict(null)
      setCurrentDraft(null)
      await refreshDraftPaths()
      setNotice('已放弃草稿；该文件在远端已不存在，下次同步会移除')
    } finally {
      conflictBusyRef.current = false
    }
  }

  async function openNote(path: string, anchor?: HeadingAnchor): Promise<void> {
    // 22：记录离开首页时的位置；阅读中内链切篇（current 非空）不覆盖
    if (!current) homeScrollTop.current = mainRef.current?.scrollTop ?? 0
    const file = await getFile(path)
    if (!file || file.status !== 'ok') {
      setNotice(`「${path}」尚未镜像（超过 10MB 或尚未同步），暂时打不开。`)
      return
    }
    setNotice(null)
    setFindOpen(false) // 切入新笔记默认关闭查找（find 状态不跨篇）
    const reading = await loadReading(path)
    readerScrollRef.current = reading?.scrollTop ?? 0
    setCurrent({
      path,
      content: file.content,
      scrollTop: reading?.scrollTop ?? 0,
      anchor,
      sha: file.sha
    })
    await recordOpen(path)
    await refreshRecent()
    await refreshCurrentDraft(path)
  }

  function handleScroll(scrollTop: number): void {
    if (!current) return
    readerScrollRef.current = scrollTop
    if (scrollTimer.current !== undefined) clearTimeout(scrollTimer.current)
    scrollTimer.current = (setTimeout(() => {
      void saveScroll(current.path, scrollTop)
    }, SCROLL_SAVE_DELAY) as unknown) as number
  }

  const configured = settings != null && isConfigured(settings)
  const downloadingThisNote =
    downloadingAssets != null && current != null && downloadingAssets.path === current.path
  // 回写开关 + 令牌齐全才露出编辑能力；>1MB 的笔记点 ✏️ 时提示只读
  const writeUi = !!settings?.writeBackEnabled && (settings?.token.length ?? 0) > 0
  const canEditCurrent = writeUi && current != null
  const showDraftBanner = writeUi && current != null && currentDraft?.path === current.path
  const editorIsDirty = editor != null && editorDirty(editor)

  return (
    <div class="app">
      <header class="app__header">
        {editor ? (
          <>
            <button class="btn" onClick={() => void closeEditor()} disabled={saving}>
              ‹ 返回
            </button>
            <h1 class="app__title app__title--trunc">{editor.path}</h1>
            <div class="app__actions">
              <button
                class="btn"
                onClick={() => void saveEditor()}
                disabled={saving || !editorIsDirty}
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </>
        ) : current ? (
          <>
            <button class="btn" onClick={() => setCurrent(null)}>
              ‹ 返回
            </button>
            <h1 class="app__title app__title--trunc">{current.path}</h1>
            <div class="app__actions">
              {canEditCurrent && (
                <button class="btn" aria-label="编辑笔记" onClick={() => void openEditor()}>
                  ✏️
                </button>
              )}
              <button
                class="btn"
                onClick={() => void downloadNoteAssets()}
                disabled={downloadingThisNote}
              >
                {downloadingThisNote ? '下载中…' : '全下'}
              </button>
              {/* 09 单篇查找入口：PWA 独立模式无 Safari 原生 find，查找在应用内 */}
              <button
                class="btn"
                aria-pressed={findOpen}
                aria-label={findOpen ? '关闭笔记内查找' : '在笔记内查找'}
                onClick={() => setFindOpen((o) => !o)}
              >
                🔍
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 class="app__title">MD 镜像</h1>
            <div class="app__actions">
              {writeUi && (
                <button class="btn" aria-label="新建笔记" onClick={openNewNote}>
                  ＋
                </button>
              )}
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

      {updates.banner && (
        <UpdateBanner
          live={updates.banner.live}
          onApply={() => void updates.applyUpdate()}
          onIgnore={() => void updates.dismissUpdate()}
        />
      )}
      {updates.offlineReady && (
        <div class="update-banner" role="status">
          <span class="update-banner__text">📦 已可离线阅读</span>
          <button class="update-banner__btn" onClick={updates.dismissOfflineReady}>
            知道了
          </button>
        </div>
      )}

      <SyncBanner status={syncStatus} fail={syncFail} lastSyncedAt={lastSyncedAt} />

      <main
        ref={mainRef}
        class={current || editor ? 'app__main app__main--flush' : 'app__main'}
      >
        {editor ? (
          <EditorView
            path={editor.path}
            value={editor.content}
            saving={saving}
            onInput={handleEditorInput}
            onDiscard={() => void discardEditor()}
            assetLoader={assetLoader}
            autoDownloadAssets={settings?.autoDownloadAssets ?? true}
            renderMath={settings?.renderMath ?? false}
            renderMermaid={settings?.renderMermaid ?? false}
            theme={resolvedTheme}
          />
        ) : current ? (
          <>
            {showDraftBanner && (
              <div class="draft-banner" role="status">
                <span class="draft-banner__text">本机有未提交草稿</span>
                <button class="btn" onClick={() => void openEditor()}>
                  继续编辑
                </button>
              </div>
            )}
            <ReaderView
              key={current.path}
              path={current.path}
              content={current.content}
              initialScrollTop={current.scrollTop}
              initialAnchor={current.anchor}
              onAnchorMiss={() => setNotice('未找到该标题，已从上次阅读位置打开')}
              assetLoader={assetLoader}
              refreshToken={readerTick}
              autoDownloadAssets={settings?.autoDownloadAssets ?? true}
              renderMath={settings?.renderMath ?? false}
              renderMermaid={settings?.renderMermaid ?? false}
              theme={resolvedTheme}
              tocPinned={settings?.tocPinned ?? false}
              onTocPinChange={(next) => void handleTocPinChange(next)}
              findOpen={findOpen}
              onFindClose={() => setFindOpen(false)}
              onOpenNote={(p) => void openNote(p)}
              onScroll={handleScroll}
            />
          </>
        ) : settings == null ? (
          <p class="app__hint">载入中…</p>
        ) : showSettings || !configured ? (
          <SettingsView
            onClose={() => setShowSettings(false)}
            onSaved={() => void handleSettingsSaved()}
            appVersion={updates.appVersion}
            lastCheckedAt={updates.lastCheckedAt}
            checking={updates.checking}
            latestNote={updates.latestNote}
            onCheckUpdates={() => void updates.checkForUpdates()}
            syncing={syncStatus === 'syncing'}
            onMirrorCleared={() => void handleMirrorCleared()}
            draftCount={draftPaths.size}
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
              placeholder="搜索标题 / 文件名 / 正文"
              value={query}
              onInput={handleQueryInput}
            />
            {query.trim() ? (
              <SearchResults
                hits={hits}
                query={query}
                onOpen={(p) => void openNote(p)}
                onOpenHeading={(p, anchor) => void openNote(p, anchor)}
              />
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
                            {writeUi && draftPaths.has(r.path) && (
                              <span class="draft-mark">草稿</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
                {files.length > 0 && (
                  <>
                    <h2 class="recent__title">全部笔记（{files.length}）</h2>
                    <NotesList
                      files={files}
                      onOpen={(p) => void openNote(p)}
                      draftPaths={writeUi ? draftPaths : undefined}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {conflict && (
        <ConflictPanel
          kind={conflict.kind}
          remoteContent={conflict.remoteContent}
          busy={conflict.busy}
          error={conflict.error}
          onOverwrite={() => void overwriteConflict()}
          onDiscard={() => void discardConflict()}
          onCancel={() => setConflict(null)}
        />
      )}

      {newNoteOpen && (
        <NewNotePanel
          directories={newNoteDirs}
          initialDir={lastNewNoteDir.current}
          busy={newNoteBusy}
          error={newNoteError}
          onDirChange={(dir) => {
            lastNewNoteDir.current = dir
          }}
          onFieldChange={() => setNewNoteError(null)}
          onCancel={closeNewNote}
          onCreate={(dir, rawName) => void handleCreateNote(dir, rawName)}
        />
      )}

      {notice && (
        <div class="notice" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}
