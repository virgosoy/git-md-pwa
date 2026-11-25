// 主题：设置里保存的「模式」（含跟随系统）与真正应用到页面的「解析值」。

export type ThemeMode = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

/** 设置模式 + 系统是否偏好浅色 → 实际应用的深/浅色。 */
export function resolveTheme(mode: ThemeMode, systemPrefersLight: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersLight ? 'light' : 'dark'
  return mode
}

/** 与 styles.css 的 --bg 保持一致：手机状态栏 / 浏览器 UI 跟随页面底色。 */
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#18181b',
  light: '#fafafa'
}

/** 把解析后的主题写到 <html data-theme>，并同步 meta theme-color。 */
export function applyThemeToDocument(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = THEME_COLORS[theme]
}

/**
 * 主题模式在 localStorage 留一份同步可读镜像：index.html 的内联脚本在首屏 JS
 * 之前据此设置 data-theme，避免浅色用户每次冷启动先闪一下深色。
 * 只存模式（不含笔记/令牌），隐私红线不受影响。
 */
const THEME_MODE_KEY = 'md-theme-mode'

export function rememberThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode)
  } catch {
    // 隐私模式/存储被禁：忽略；最坏情况是冷启动闪一下
  }
}
