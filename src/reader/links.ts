// S2 · 链接分类与仓库内路径解析（纯函数）
// 决定 []() 链接点击后的行为：
//   note     → App 内打开另一篇 md（resolveNotePath 解析目标路径）
//   external → 交给系统浏览器
//   anchor   → 页内锚点滚动（默认行为）
//   asset    → 资源文件，留给票 05（懒加载）

export type LinkKind = 'external' | 'note' | 'anchor' | 'asset'

const SCHEME_RE = /^(https?:|mailto:|tel:|ftp:)/i
const MD_RE = /\.(md|markdown)$/i

/** 去掉锚点与查询串，只剩纯路径部分。 */
function pathOnly(href: string): string {
  return href.trim().split('#')[0].split('?')[0]
}

export function classifyLink(href: string): LinkKind {
  const clean = href.trim()
  if (SCHEME_RE.test(clean) || clean.startsWith('//')) return 'external'
  if (clean.startsWith('#')) return 'anchor'
  const pathPart = pathOnly(clean)
  if (pathPart === '') return 'anchor'
  if (MD_RE.test(pathPart)) return 'note'
  // 其余相对路径一律视为资源（图片/pdf/未知），交给票 05 懒加载
  return 'asset'
}

/**
 * 解析相对 md 链接为仓库内相对路径。
 * `?`/`#` 剥离；`/` 开头视为仓库根；折叠 `.` 与 `../`。
 * 注意：markdown-it 会 href encodeURI 空格/非 ASCII，需 decode 回原文，
 * 否则与镜像存储里的原始路径对不上。
 */
export function resolveNotePath(currentPath: string, href: string): string {
  const raw = pathOnly(href)
  const absolute = raw.startsWith('/')
  let pathPart = absolute ? raw.slice(1) : raw
  try {
    pathPart = decodeURIComponent(pathPart)
  } catch {
    // 非法转义则保留原文
  }
  const baseDir =
    !absolute && currentPath.includes('/') ? currentPath.split('/').slice(0, -1) : []

  const segments = [...baseDir, ...pathPart.split('/')]
  const out: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.join('/')
}
