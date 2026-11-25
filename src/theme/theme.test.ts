import { describe, it, expect, afterEach } from 'vitest'
import {
  applyThemeToDocument,
  rememberThemeMode,
  resolveTheme
} from './theme'

// 主题解析：设置模式（含 system）→ 真正应用的深/浅色。
describe('resolveTheme', () => {
  it('dark / light 直通，不依赖系统偏好', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('system 跟随系统：浅色偏好 → light，深色偏好 → dark', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
})

describe('applyThemeToDocument', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  })

  it('浅色：根 data-theme=light，已有 meta theme-color 改成浅色背景', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)

    applyThemeToDocument('light')

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(meta.content).toBe('#fafafa')
  })

  it('深色：根 data-theme=dark，缺少 meta 时创建并写深色背景', () => {
    applyThemeToDocument('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(
      document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content')
    ).toBe('#18181b')
  })
})

describe('主题模式镜像（首屏防闪）', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('写入后镜像里是三种模式字符串', () => {
    rememberThemeMode('light')
    expect(localStorage.getItem('md-theme-mode')).toBe('light')
    rememberThemeMode('system')
    expect(localStorage.getItem('md-theme-mode')).toBe('system')
    rememberThemeMode('dark')
    expect(localStorage.getItem('md-theme-mode')).toBe('dark')
  })

  it('首次运行没有镜像', () => {
    expect(localStorage.getItem('md-theme-mode')).toBeNull()
  })
})
