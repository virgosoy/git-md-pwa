import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 票 10 追加：registerType=prompt —— 新版 SW 必须「等待」而非自己接管：
//   ① 不得自动 clientsClaim；② self.skipWaiting 只能出现在响应 SKIP_WAITING 消息的
//   处理器里（由页面「刷新」经 updateSW→messageSkipWaiting 触发）。
//   ③ dist 根必须有 version.json（网络新鲜版本源，更新检测读它），版本串形状 v<semver>+…。
// 用法：npm run verify:pwa
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

for (const f of ['sw.js', 'manifest.webmanifest', 'index.html', 'version.json']) {
  if (!existsSync(join(dist, f))) fail(`dist 缺少 ${f}`)
}

const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
if (!sw.includes('index.html')) fail('sw.js 预缓存清单未包含 index.html（离线外壳不完整）')
if (!/KaTeX_[^"']*\.(?:woff2|woff|ttf)/.test(sw)) {
  fail('sw.js 预缓存清单未包含 KaTeX 字体（woff2/woff/ttf），离线开公式会白字')
}
if (sw.includes('clientsClaim()')) {
  fail('registerType=prompt：sw.js 不应自动 clientsClaim——新版 SW 需等页面触发才接管')
}
if (!/SKIP_WAITING[\s\S]{0,120}self\.skipWaiting\(\)/.test(sw)) {
  fail('registerType=prompt：sw.js 缺 SKIP_WAITING 消息处理器（页面「刷新」没有接管通道）')
}

let declared
try {
  declared = JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8')).version
} catch (e) {
  fail(`version.json 解析失败：${e.message}`)
}
if (typeof declared !== 'string' || !/^v\d+\.\d+\.\d+/.test(declared)) {
  fail(`version.json 版本串异常：${declared}`)
}

console.log(
  `✓ PWA 产物完整：sw.js / manifest.webmanifest / index.html / version.json 均在，外壳可离线；KaTeX 字体已预缓存；prompt 模式不自跳；版本串 ${declared}。`
)
