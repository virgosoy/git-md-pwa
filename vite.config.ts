import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages 项目页子路径（https://<user>.github.io/git-md-pwa/）
  base: '/git-md-pwa/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff,woff2,ttf}'],
        navigateFallback: 'index.html'
      }
    })
  ],
  build: { target: 'es2022' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
})
