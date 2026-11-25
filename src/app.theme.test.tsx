import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { App } from './app'
import { saveSettings } from './settings/store'
import { wipeDb } from './test/wipeDb'
import { waitFor } from './test/wait'

// 主题集成：设置值经 App 真正落到 <html data-theme> 与 meta theme-color。
vi.mock('virtual:pwa-register/preact', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {}
  })
}))

/** 可控的 matchMedia 桩：只模拟 prefers-color-scheme 媒体查询与 change 事件。 */
function stubMatchMedia(prefersLight: boolean) {
  let matches = prefersLight
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: light)',
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb)
  }
  vi.stubGlobal('matchMedia', () => mql as unknown as MediaQueryList)
  return {
    set(next: boolean) {
      matches = next
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent))
    }
  }
}

function mountApp(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  render(<App />, c)
  return c
}

describe('App 主题接线', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    delete document.documentElement.dataset.theme
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('设置的浅色在挂载后应用到根节点与状态栏颜色', async () => {
    await saveSettings({ theme: 'light' })
    mountApp()

    await waitFor(() => document.documentElement.dataset.theme === 'light')
    expect(
      document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
    ).toBe('#fafafa')
  })

  it('跟随系统：系统切到浅色时实时应用', async () => {
    const media = stubMatchMedia(false)
    await saveSettings({ theme: 'system' })
    mountApp()

    await waitFor(() => document.documentElement.dataset.theme === 'dark')
    media.set(true)
    await waitFor(() => document.documentElement.dataset.theme === 'light')
  })
})
