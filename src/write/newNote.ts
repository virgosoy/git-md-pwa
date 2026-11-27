// 新建笔记的纯逻辑：文件名规范化、目录推导、路径拼接与提交说明。
// 目录只来自既有镜像目录：不扫描远端、不新建目录（ADR-0005）。

export interface NormalizedFileName {
  /** 规范化后的文件名（自动补 `.md`）；空名或非法时为空串 */
  name: string
  /** 非法原因；空名或合法时为 null（空名由 UI 禁用「创建」） */
  error: string | null
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

/** 只填文件名：去首尾空白、自动补 `.md`；拒绝路径与控制字符。 */
export function normalizeFileName(raw: string): NormalizedFileName {
  const trimmed = raw.trim()
  if (trimmed === '') return { name: '', error: null }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return { name: '', error: '文件名不能包含 / 或 \\' }
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return { name: '', error: '文件名不能包含控制字符' }
  }
  if (trimmed === '.' || trimmed === '..') {
    return { name: '', error: '文件名不能是 . 或 ..' }
  }
  const name = /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`
  return { name, error: null }
}

/** 目录下拉数据：根目录固定首项，其余从镜像路径去文件名、含嵌套父目录、去重排序。 */
export function deriveDirectories(files: readonly { path: string }[]): string[] {
  const dirs = new Set<string>()
  for (const file of files) {
    let dir = file.path.slice(0, Math.max(file.path.lastIndexOf('/'), 0))
    while (dir !== '') {
      dirs.add(dir)
      const slash = dir.lastIndexOf('/')
      if (slash < 0) break
      dir = dir.slice(0, slash)
    }
  }
  return ['/', ...[...dirs].sort((a, b) => a.localeCompare(b))]
}

/** 目录 + 文件名 → 仓库内路径（根目录不带前导 /）。 */
export function joinNotePath(dir: string, name: string): string {
  return dir === '/' || dir === '' ? name : `${dir}/${name}`
}

/** 新建提交说明：与编辑的「手机编辑：」区分。 */
export function buildCreateMessage(path: string): string {
  return `手机新建：${path}`
}
