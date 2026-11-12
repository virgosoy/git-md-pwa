import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/**
 * 构建时版本串：v<package.version>+<git 短 sha>。
 * 同一串经 define 注入 __APP_VERSION__，并写成 dist/version.json（.json 不在预缓存
 * glob 内 → 只走网络拿新鲜值，SW 更新检测据此判断「是不是新版本」）。
 */
function currentVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string
  }
  let sha = ''
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    sha = 'nogit'
  }
  return `v${pkg.version}+${sha}`
}

const APP_VERSION = currentVersion()

export default defineConfig({
  // GitHub Pages 项目页子路径（https://<user>.github.io/git-md-pwa/）
  base: '/git-md-pwa/',
  // 注入 __APP_VERSION__：define 是文本替换，JSON.stringify 保证替换成带引号字符串字面量
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    preact(),
    VitePWA({
      // prompt：检测到新版不静默 reload，交给页面提示「有新版本」后用户点刷新（Q2）
      registerType: 'prompt',
      // 手动经 useRegisterSW 注册；禁止插件再往 index.html 注入第二份默认注册
      injectRegister: null,
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'MD 镜像 · 私有笔记离线阅读',
        short_name: 'MD镜像',
        description: '把 GitHub 私有 Markdown 仓库镜像到手机离线阅读',
        display: 'standalone',
        start_url: '/git-md-pwa/',
        theme_color: '#18181b',
        background_color: '#18181b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // 字体后缀：KaTeX 按需渲染的产物字体必须预缓存，否则离线开公式白字节（07a）
        // version.json 是 .json，天然不在本 glob → 只走网络，更新检测能得到新鲜版本
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff,woff2,ttf}'],
        navigateFallback: 'index.html'
      }
    }),
    // 构建期把同一版本串写进 dist/version.json（emitFile 资产不入任何 chunk）
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() })
        })
      }
    } satisfies Plugin,
  ],
  build: { target: 'es2022' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // mermaid 是巨型按需依赖：限制并发 worker 数，避免多个 fork 同时转译/加载它
    // 在两三台开发机上把全量测试跑 OOM（区域分配失败）。4 在本机 = 稳定全绿 + 够快。
    maxWorkers: 4,
    server: {
      deps: {
        external: ['mermaid'] // 真 mermaid 冒烟用 Node 原生加载预构建单文件，跳过转译整个图
      }
    }
  }
})
