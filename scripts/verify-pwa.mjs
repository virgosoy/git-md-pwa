import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 票 01 收尾验证：构建产物里必须有离线外壳（SW + manifest），且 SW 预缓存首页。
// 用法：npm run verify:pwa
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

for (const f of ['sw.js', 'manifest.webmanifest', 'index.html']) {
  if (!existsSync(join(dist, f))) fail(`dist 缺少 ${f}`)
}

const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
if (!sw.includes('index.html')) fail('sw.js 预缓存清单未包含 index.html（离线外壳不完整）')

console.log('✓ PWA 产物完整：sw.js / manifest.webmanifest / index.html 均在，外壳可离线。')
