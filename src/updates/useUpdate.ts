// U3 · 更新编排 hook：把 vite-plugin-pwa 的 prompt 客户端、线上版本对比、
// 每版本一次提示、周期复查、手动检查捏成一个 App 可用的接口。
// 测试缝：SW 引擎经 useRegisterSW 的 onNeedRefresh / onRegisteredSW / updateServiceWorker
// 三个插座注入，jsdom 里 mock 这个 virtual 模块即可驱动，不模拟浏览器 SW 生命周期。

import { useEffect, useRef, useState } from 'preact/hooks'
import { useRegisterSW } from 'virtual:pwa-register/preact'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { loadSettings, saveSettings } from '../settings/store'
import { withTimeout } from '../lib/async'
import { bannerNeeded, CURRENT_APP_VERSION, fetchLiveVersion } from './version'
import { applyNotReadyNote, manualCheckNote, type UpdateReadiness } from './manualNote'
import { detectInstalledBuild, type InstalledBuild } from './installed'

/** 在线时周期复查 SW 更新的间隔（Q4：启动 + 周期） */
const PERIODIC_CHECK_MS = 10 * 60_000

/** 等新 SW 完成安装的上限（首次安装大图包慢，但 updating 只补差异文件） */
const UPDATE_INSTALL_TIMEOUT_MS = 30_000
/** 等浏览器完成 SW 字节比对的上限（防止「检查中…」无限悬挂） */
const UPDATE_CHECK_TIMEOUT_MS = 15_000
/** installed 之后进入 registration.waiting 的宽限 */
const WAITING_SETTLE_MS = 2_000
/** 注册回调没来、主动 getRegistration() 的上限（本地操作，只防悬挂） */
const GET_REGISTRATION_TIMEOUT_MS = 2_000
/** 手动检查提示的显示时长（「已装好，重开」这类长句需要读完） */
const MANUAL_NOTE_TTL_MS = 8_000

/** 等 worker 变为 installed：update() 只保证「发现并开始安装」 */
function whenInstalled(worker: ServiceWorker): Promise<boolean> {
  if (worker.state === 'installed' || worker.state === 'activated') return Promise.resolve(true)
  if (worker.state === 'redundant') return Promise.resolve(false)
  return new Promise((resolve) => {
    const onChange = (): void => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        worker.removeEventListener('statechange', onChange)
        resolve(true)
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onChange)
        resolve(false)
      }
    }
    worker.addEventListener('statechange', onChange)
  })
}

async function waitForWaiting(reg: ServiceWorkerRegistration, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (!reg.waiting) {
    if (Date.now() >= deadline) return false
    await new Promise((r) => window.setTimeout(r, 25))
  }
  return true
}

/**
 * 触发一次 SW 更新检查，并等新 worker 真正进入 waiting。
 * 根因防线：prompt 客户端的 updateServiceWorker() = messageSkipWaiting()，
 * 只有 registration.waiting 存在时才有接收方；update() 是异步的，且只保证
 * 「已开始安装」。等不到 waiting 就亮横幅/刷新 → 点了毫无反应。
 *
 * up-to-date 只说明「线上 sw.js == 当前 SW」；页面可能仍跑旧构建，
 * 那是 detectInstalledBuild() 的事，别在这里下结论。
 */
async function ensureUpdateReady(reg: ServiceWorkerRegistration): Promise<UpdateReadiness> {
  if (reg.waiting) return 'ready'
  if (!reg.installing) {
    let updateFound = false
    const onUpdateFound = (): void => {
      updateFound = true
    }
    reg.addEventListener('updatefound', onUpdateFound)
    try {
      // ok=比对完成；fail=网络/离线失败；timeout=不知道结果，别谎称已是最新
      const result = await withTimeout(
        reg.update().then(
          () => 'ok' as const,
          () => 'fail' as const
        ),
        UPDATE_CHECK_TIMEOUT_MS,
        'timeout' as const
      )
      if (result === 'fail') return 'failed'
      if (result === 'timeout' && !reg.waiting && !reg.installing) return 'timeout'
      if (!updateFound && !reg.waiting && !reg.installing) {
        // 有的 WebKit 先 resolve update()、再派发 updatefound：让事件有机会落地
        await new Promise((r) => window.setTimeout(r, 0))
      }
    } finally {
      reg.removeEventListener('updatefound', onUpdateFound)
    }
  }
  if (reg.waiting) return 'ready'
  const installing = reg.installing
  if (!installing) return 'up-to-date'
  const installed = await withTimeout(
    whenInstalled(installing),
    UPDATE_INSTALL_TIMEOUT_MS,
    false
  )
  if (!installed) return reg.waiting ? 'ready' : reg.installing ? 'pending' : 'up-to-date'
  if (await waitForWaiting(reg, WAITING_SETTLE_MS)) return 'ready'
  return reg.installing ? 'pending' : 'up-to-date'
}

export interface UpdateState {
  /** 可见的「发现新版本」横幅；live=null 表示线上版本没取到，显示通用文案 */
  banner: { live: string | null } | null
  /** 首次安装、SW 接管后的一次性「已可离线阅读」提示 */
  offlineReady: boolean
  /** 手动「检查更新」进行中 */
  checking: boolean
  /** 手动检查的瞬时反馈文案（已是最新 / 检查失败）；null=无 */
  latestNote: string | null
  /** 上次手动检查的时刻 */
  lastCheckedAt: number | null
}

export interface UpdateActions {
  /** 当前正在运行的构建版本串 */
  appVersion: string
  /** 手动「检查更新」（verbose：同版本也已提示过也照弹，Q6 逃生舱） */
  checkForUpdates: () => Promise<void>
  /** 横幅「刷新」：持久化已提示版本 → messageSkipWaiting → 新版接管 → reload */
  applyUpdate: () => Promise<void>
  /** 横幅「稍后」：记住已提示过此版本，本次会话内不再出现 */
  dismissUpdate: () => Promise<void>
  dismissOfflineReady: () => void
}

export function useUpdate(): UpdateState & UpdateActions {
  const [banner, setBanner] = useState<{ live: string | null } | null>(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [checking, setChecking] = useState(false)
  const [latestNote, setLatestNote] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const runningVersionRef = useRef(CURRENT_APP_VERSION)

  /** 瞬时反馈文案：设置页那行提示，到点自动收起 */
  function showNote(note: string | null, ttlMs: number): void {
    setLatestNote(note)
    if (note !== null) {
      window.setTimeout(() => setLatestNote(null), ttlMs)
    }
  }

  /**
   * 手动检查用：注册回调（onRegisteredSW）还没来时代取一次 registration。
   * iOS 上注册/回调可能晚到；拿不到 registration 不代表没有新版本，只能如实报「尚未就绪」。
   */
  async function resolveRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (registrationRef.current) return registrationRef.current
    const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
    if (!sw || typeof sw.getRegistration !== 'function') return null
    let pending: Promise<ServiceWorkerRegistration | undefined>
    try {
      pending = sw.getRegistration()
    } catch {
      return null
    }
    const reg = await withTimeout(pending, GET_REGISTRATION_TIMEOUT_MS, undefined)
    if (reg) registrationRef.current = reg
    return reg ?? null
  }

  /** 自动路径：needRefresh（新 SW 在 waiting）→ 取线上版本 → Q8 只提示一次闸门 */
  async function showAutoBanner(): Promise<void> {
    const [s, live] = await Promise.all([loadSettings(), fetchLiveVersion()])
    if (bannerNeeded(live, s.lastPromptedVersion)) setBanner({ live })
  }

  async function onAutoUpdateSignal(): Promise<void> {
    await showAutoBanner()
  }
  function onOfflineReadySignal(): void {
    setOfflineReady(true)
  }
  const onRegisteredSW: RegisterSWOptions['onRegisteredSW'] = (_url, reg) => {
    registrationRef.current = reg ?? null
  }

  const { updateServiceWorker: updateSW } = useRegisterSW({
    immediate: true,
    onNeedRefresh: () => void onAutoUpdateSignal(),
    onOfflineReady: onOfflineReadySignal,
    onRegisteredSW
  })

  // Q4 周期复查：在线时每 PERIODIC_CHECK_MS 调 registration.update()，
  // 浏览器随即按字节比对 sw.js；有新字节 → waiting 事件 → onNeedRefresh → 闸门
  useEffect(() => {
    const id = window.setInterval(() => {
      if (navigator.onLine) void registrationRef.current?.update()
    }, PERIODIC_CHECK_MS)
    return () => window.clearInterval(id)
  }, [])

  async function persistPrompted(live: string | null): Promise<void> {
    if (live) await saveSettings({ lastPromptedVersion: live })
  }

  async function applyUpdate(): Promise<void> {
    if (!banner) return
    const reg = await resolveRegistration()
    const readiness = reg ? await ensureUpdateReady(reg) : 'unavailable'
    if (readiness !== 'ready') {
      // 没有可接管的 waiting SW 时绝不假装刷新：保住横幅，让用户稍后重试
      showNote(applyNotReadyNote(readiness), 4000)
      return
    }
    await persistPrompted(banner.live)
    setBanner(null)
    await activateUpdate()
  }

  /** 让 waiting SW 接管并 reload；controllerchange 是接管成功的可靠信号 */
  async function activateUpdate(): Promise<void> {
    const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
    let reloaded = false
    const reload = (): void => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    sw?.addEventListener('controllerchange', reload)
    await updateSW()
    // 兜底：个别 WebKit 版本不派发 controllerchange，至少要让「刷新」有反应
    if (sw) window.setTimeout(reload, 5000)
  }

  async function dismissUpdate(): Promise<void> {
    if (banner) await persistPrompted(banner.live)
    setBanner(null)
  }

  function dismissOfflineReady(): void {
    setOfflineReady(false)
  }

  async function checkForUpdates(): Promise<void> {
    if (checking) return
    setChecking(true)
    try {
      const reg = await resolveRegistration()
      // 版本号（version.json）只用来给横幅标注；能否更新一律以 SW 是否真正可接管为准。
      // 只改文档的提交会让 version.json 变、sw.js 字节不变；update() 没发现新 worker 时
      // 不能据此谎称「有更新」，但也不能说成「没有更新」——页面可能还跑旧构建。
      const [live, readiness] = await Promise.all([
        fetchLiveVersion(),
        reg ? ensureUpdateReady(reg) : Promise.resolve<UpdateReadiness>('unavailable')
      ])
      setLastCheckedAt(Date.now())
      if (readiness === 'ready') {
        // 线上确实有新 SW 可接管：verbose，不经过 lastPrompted 闸门
        showNote(null, 0)
        setBanner({ live })
        return
      }
      setBanner(null)
      // SW 已落后于线上、但页面可能还跑旧构建：读本机预缓存判断「是不是已装好只差重开」。
      // 版本串相同或还在安装时不必读（没有可判定的分歧）。
      const installed: InstalledBuild =
        readiness !== 'pending' && (live === null || live !== runningVersionRef.current)
          ? await detectInstalledBuild()
          : 'unknown'
      showNote(
        manualCheckNote({
          readiness,
          live,
          running: runningVersionRef.current,
          installed
        }),
        MANUAL_NOTE_TTL_MS
      )
    } finally {
      setChecking(false)
    }
  }

  return {
    banner,
    offlineReady,
    checking,
    latestNote,
    lastCheckedAt,
    appVersion: runningVersionRef.current,
    checkForUpdates,
    applyUpdate,
    dismissUpdate,
    dismissOfflineReady
  }
}
