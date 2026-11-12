// U3 · 更新编排 hook：把 vite-plugin-pwa 的 prompt 客户端、线上版本对比、
// 每版本一次提示、周期复查、手动检查捏成一个 App 可用的接口。
// 测试缝：SW 引擎经 useRegisterSW 的 onNeedRefresh / onRegisteredSW / updateServiceWorker
// 三个插座注入，jsdom 里 mock 这个 virtual 模块即可驱动，不模拟浏览器 SW 生命周期。

import { useEffect, useRef, useState } from 'preact/hooks'
import { useRegisterSW } from 'virtual:pwa-register/preact'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { loadSettings, saveSettings } from '../settings/store'
import { bannerNeeded, CURRENT_APP_VERSION, fetchLiveVersion } from './version'

/** 在线时周期复查 SW 更新的间隔（Q4：启动 + 周期） */
const PERIODIC_CHECK_MS = 10 * 60_000

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
    if (banner) await persistPrompted(banner.live)
    setBanner(null)
    await updateSW() // prompt 客户端：messageSkipWaiting → 新版 controlling → 页面 reload
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
      const live = await fetchLiveVersion()
      setLastCheckedAt(Date.now())
      if (live && live !== runningVersionRef.current) {
        // 线上确实有新版：马上叫浏览器去比对 SW（waiting 后横幅刷新按钮就能用），
        // 并直接拉出横幅——verbose，不经过 lastPrompted 闸门
        setLatestNote(null)
        setBanner({ live })
        void registrationRef.current?.update()
      } else {
        setBanner(null)
        setLatestNote(live === null ? '检查失败，稍后再试' : '已是最新版本')
        window.setTimeout(() => setLatestNote(null), 4000)
      }
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
