import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { useUpdate } from './useUpdate'
import { CURRENT_APP_VERSION } from './version'
import { loadSettings, saveSettings } from '../settings/store'
import { wipeDb } from '../test/wipeDb'

// U3 集成测试：SW 引擎在 virtual:pwa-register/preact 这一个模块缝上被假掉（不建造
// ServiceWorker 生命周期），其余走真货——真 IndexedDB(fake-indexeddb)、真 fetch(stub)、
// 真 Preact 渲染。驱动点 = 假适配器捕获到的 onNeedRefresh / onRegisteredSW / updateServiceWorker。

const LIVE = 'v0.0.2+zzz'
const OLD = 'v0.0.1+aaa'

const sw = vi.hoisted(() => ({
  updateSW: vi.fn(async () => {}),
  onNeedRefresh: null as null | (() => void),
  onOfflineReady: null as null | (() => void),
  onRegisteredSW: null as null | ((url: string, reg: ServiceWorkerRegistration | undefined) => void)
}))

vi.mock('virtual:pwa-register/preact', () => ({
  useRegisterSW: (opts: {
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegisteredSW?: (url: string, reg: ServiceWorkerRegistration | undefined) => void
  }) => {
    sw.onNeedRefresh = opts.onNeedRefresh ?? null
    sw.onOfflineReady = opts.onOfflineReady ?? null
    sw.onRegisteredSW = opts.onRegisteredSW ?? null
    return {
      needRefresh: [false, () => {}],
      offlineReady: [false, () => {}],
      updateServiceWorker: sw.updateSW
    }
  }
}))

function Host() {
  const u = useUpdate()
  return (
    <div data-sel="host">
      <span data-sel="banner">{u.banner ? (u.banner.live ?? 'generic') : 'none'}</span>
      <span data-sel="note">{u.latestNote ?? ''}</span>
      <span data-sel="offline">{u.offlineReady ? 'ready' : ''}</span>
      <button data-sel="apply" onClick={() => void u.applyUpdate()}>
        apply
      </button>
      <button data-sel="dismiss" onClick={() => void u.dismissUpdate()}>
        dismiss
      </button>
      <button data-sel="check" onClick={() => void u.checkForUpdates()}>
        check
      </button>
    </div>
  )
}

let container: HTMLElement

function mountHost(): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<Host />, container)
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

function sel(name: string): HTMLElement {
  return container.querySelector(`[data-sel="${name}"]`) as HTMLElement
}

/** 线上 version.json 返回固定版本 */
function stubLive(version: string | null, fail = false): void {
  vi.stubGlobal(
    'fetch',
    async () => {
      if (fail) throw new TypeError('Failed to fetch')
      return new Response(
        JSON.stringify({ version }),
        { status: version === null ? 404 : 200 }
      )
    }
  )
}

describe('useUpdate', () => {
  beforeEach(async () => {
    await wipeDb()
    sw.updateSW.mockReset()
    sw.onNeedRefresh = null
    sw.onOfflineReady = null
    sw.onRegisteredSW = null
    stubLive(LIVE)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('自动路径：新 SW waiting (onNeedRefresh) + 线上版本与历史不同 → 横幅带版本号', async () => {
    await saveSettings({ lastPromptedVersion: OLD })
    mountHost()
    sw.onNeedRefresh?.()
    await flush()
    expect(sel('banner').textContent).toBe(LIVE)
  })

  it('Q8：同版本已提示过 → 自动路径不再弹', async () => {
    await saveSettings({ lastPromptedVersion: LIVE })
    mountHost()
    sw.onNeedRefresh?.()
    await flush()
    expect(sel('banner').textContent).toBe('none')
  })

  it('自动路径取不到线上版本 → 通用横幅兜底', async () => {
    stubLive(null, true) // 离线：fetch 抛错
    await saveSettings({ lastPromptedVersion: OLD })
    mountHost()
    sw.onNeedRefresh?.()
    await flush()
    expect(sel('banner').textContent).toBe('generic')
  })

  it('「稍后」把该版本记为已提示，再同版不复弹', async () => {
    await saveSettings({ lastPromptedVersion: OLD })
    mountHost()
    sw.onNeedRefresh?.()
    await flush()
    expect(sel('banner').textContent).toBe(LIVE)

    sel('dismiss').click()
    await flush()
    expect(sel('banner').textContent).toBe('none')
    expect((await loadSettings()).lastPromptedVersion).toBe(LIVE)
  })

  it('「刷新」持久化已提示版本并调用 updateSW（触发新版接管 + reload）', async () => {
    await saveSettings({ lastPromptedVersion: OLD })
    mountHost()
    sw.onNeedRefresh?.()
    await flush()
    sel('apply').click()
    await flush()
    expect(sw.updateSW).toHaveBeenCalledTimes(1)
    expect((await loadSettings()).lastPromptedVersion).toBe(LIVE)
  })

  it('手动检查：同版本已提示也照弹（verbose 逃生舱）', async () => {
    await saveSettings({ lastPromptedVersion: LIVE }) // 已忽略过 v0.0.2+zzz
    mountHost()
    sel('check').click()
    await flush()
    expect(sel('banner').textContent).toBe(LIVE)
    expect(sel('note').textContent).toBe('')
  })

  it('手动检查：线上已是当前版本 → 提示已是最新，不弹横幅', async () => {
    stubLive(CURRENT_APP_VERSION)
    await saveSettings({ lastPromptedVersion: OLD })
    mountHost()
    sel('check').click()
    await flush()
    expect(sel('banner').textContent).toBe('none')
    expect(sel('note').textContent).toBe('已是最新版本')
  })

  it('手动检查：取不到线上 → 检查失败反馈', async () => {
    stubLive(LIVE, true)
    mountHost()
    sel('check').click()
    await flush()
    expect(sel('banner').textContent).toBe('none')
    expect(sel('note').textContent).toBe('检查失败，稍后再试')
  })

  it('首次安装 SW 接管 → offlineReady 一次性提示；点「知道了」收起', async () => {
    mountHost()
    sw.onOfflineReady?.()
    await flush()
    expect(sel('offline').textContent).toBe('ready')
  })

  it('周期复查：在线时每 10 分钟调一次 registration.update()', async () => {
    vi.useFakeTimers()
    mountHost()
    // rAF 在小芯测里也被 fake：按整帧(16ms)推进两帧，让 useEffect 挂上 setInterval
    await vi.advanceTimersByTimeAsync(32)
    await Promise.resolve()
    const reg = { update: vi.fn() } as unknown as ServiceWorkerRegistration
    sw.onRegisteredSW?.('/git-md-pwa/sw.js', reg)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await Promise.resolve()
    expect(reg.update).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await Promise.resolve()
    expect(reg.update).toHaveBeenCalledTimes(2)
  })
})
