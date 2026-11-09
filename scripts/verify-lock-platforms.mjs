// 守卫：防 package-lock.json 的「可选平台二进制包」条目被本机平台意外洗掉。
// 背景：Windows 上 `npm install` 重写 lock 时只留本机平台条目（win32），
// ubuntu `npm ci` 严格按 lock 装 → 缺 linux 原生 binding → 构建崩
//（实际触发过 rolldown / rollup / lightningcss / typescript@7 四族）。
// 规则（通用，不需手列名单）：任一「以 OS 令牌为后缀分段」的包族只要有条目，
// 就必须同时含 win32 与 linux/darwin 条目，否则视为被洗成单平台 → 红。
// 用法：node scripts/verify-lock-platforms.mjs（CI 在 npm ci 前跑）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))

// OS 令牌 → 用于识别「平台二进制包名」；族 = 名字里 OS 令牌之前的前缀。
const OS_TOKEN_RE = /-(linux|darwin|win32|freebsd|android|wasm|netbsd|openbsd|sunos|aix)-/

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const families = new Map() // 族 → 条目[]
for (const key of Object.keys(lock.packages)) {
  const name = key.startsWith('node_modules/') ? key.slice('node_modules/'.length) : key
  const m = name.match(OS_TOKEN_RE)
  if (!m) continue
  const family = name.slice(0, m.index + 1)
  families.set(family, (families.get(family) ?? []).concat(name))
}

const bad = []
for (const [family, entries] of families) {
  const hasWin32 = entries.some((e) => e.includes('-win32-'))
  const hasCross = entries.some((e) => e.includes('-linux-') || e.includes('-darwin-'))
  if (!hasWin32 || !hasCross) {
    bad.push(`${family}（本次条目 ${entries.join(', ')}）`)
  }
}

if (families.size === 0) {
  console.log('ℹ 当前无原生平台包依赖，守卫跳过。')
} else if (bad.length === 0) {
  console.log(`✓ 原生平台包（${families.size} 族）lock 条目完整：win32 + linux/darwin 均在。`)
} else {
  fail(
    `以下平台的 lock 条目疑似被 Windows npm 洗掉了：\n  ${bad.join('\n  ')}\n` +
      `恢复参考：git show <跨平台 ref>:package-lock.json 里同族条目并回 lock 再提交（历史上 6cbd49a 是全量跨平台的）。`
  )
}
