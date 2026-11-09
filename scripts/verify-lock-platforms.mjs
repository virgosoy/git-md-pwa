// 守卫：防 package-lock.json 的「平台二进制包」条目被本机平台意外洗掉。
// 背景：Windows 上 `npm install` 重写 lock 时只留本机平台条目（win32），
// GitHub Actions（ubuntu）`npm ci` 严格按 lock 装 → 缺 linux 原生 binding → 构建崩。
// 规则：任一已知原生平台系列只要有条目，就必须同时含 win32 与 linux/darwin 条目，
// 否则视为被洗成单平台，直接失败。用法：node scripts/verify-lock-platforms.mjs（CI 在 npm ci 前跑）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))

// 已知的「可选平台二进制」包前缀（值即 family）。新原生依赖加在这里。
const FAMILIES = ['@rolldown/binding', '@rollup/rollup', '@esbuild', '@typescript/typescript']

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

let checked = 0
for (const family of FAMILIES) {
  const entries = Object.keys(lock.packages).filter((k) =>
    k.startsWith(`node_modules/${family}-`)
  )
  if (entries.length === 0) continue
  checked += 1
  const hasWin32 = entries.some((e) => /-win32-/.test(e))
  const hasCross = entries.some((e) => /-(linux-|darwin-)/.test(e))
  if (!hasWin32 || !hasCross) {
    fail(
      `${family} 的平台条目疑似被 Windows npm 洗掉了（本次 union: ${entries.join(', ')}）。` +
        `用 git show 6cbd49a:package-lock.json 里的同族条目并回 lock 再提交。`
    )
  }
}

if (checked === 0) {
  console.log('ℹ 当前无原生平台包依赖，守卫跳过。')
} else {
  console.log(`✓ 原生平台包（${checked} 族）lock 条目完整：win32 + linux/darwin 均在。`)
}
