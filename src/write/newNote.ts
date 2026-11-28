// 新建笔记的纯逻辑：文件名规范化、目录推导、新建目录路径、路径拼接与提交说明。
// 目录下拉只来自既有镜像；新建目录随首篇文件诞生，不扫描远端、不做空目录（Git 不存空目录，ADR-0005）。

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

export interface NormalizedDirPath {
  /** 规范化后的相对目录路径（多级用 `/` 分隔）；空串或非法时为空串 */
  dir: string
  /** 非法原因；空串或合法时为 null（空串由 UI 禁用创建） */
  error: string | null
}

/** 新建目录：相对路径可多级；逐段去空白，拒绝空段、`.`/`..`、`\` 与控制字符。 */
export function normalizeDirPath(raw: string): NormalizedDirPath {
  const trimmed = raw.trim()
  if (trimmed === '') return { dir: '', error: null }
  if (trimmed.includes('\\')) return { dir: '', error: '目录名不能包含 \\' }
  if (CONTROL_CHARS.test(trimmed)) {
    return { dir: '', error: '目录名不能包含控制字符' }
  }
  const segments = trimmed.split('/').map((s) => s.trim())
  if (segments.some((s) => s === '')) {
    return {
      dir: '',
      error: '目录路径不能有空目录名（不能以 / 开头或结尾，也不能出现 //）'
    }
  }
  if (segments.some((s) => s === '.' || s === '..')) {
    return { dir: '', error: '目录名不能是 . 或 ..' }
  }
  return { dir: segments.join('/'), error: null }
}

/** 父目录 + 相对新目录 → 仓库内目录路径（根目录不带前导 /）；相对路径为空时返回父目录。 */
export function joinDirPath(baseDir: string, relativeDir: string): string {
  if (relativeDir === '') return baseDir
  return baseDir === '/' || baseDir === '' ? relativeDir : `${baseDir}/${relativeDir}`
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

export interface NewNoteTarget {
  /** 完整笔记 path；输入不完整或非法时为空串 */
  path: string
  /** 完整目录 path（不新建目录时为父目录）；新目录为空或非法时为空串 */
  dir: string
  /** 第一个非法原因；不完整或合法时为 null（空输入由 UI 禁用创建） */
  error: string | null
}

/** 新建笔记的唯一路径解析：父目录 + 可选新目录 + 文件名；弹层预览与 App 提交共用。 */
export function resolveNoteTarget(
  baseDir: string,
  rawDir: string | null,
  rawName: string
): NewNoteTarget {
  let dir = baseDir
  if (rawDir != null) {
    const normalizedDir = normalizeDirPath(rawDir)
    if (normalizedDir.error != null) {
      return { path: '', dir: '', error: normalizedDir.error }
    }
    if (normalizedDir.dir === '') return { path: '', dir: '', error: null }
    dir = joinDirPath(baseDir, normalizedDir.dir)
  }
  const normalizedName = normalizeFileName(rawName)
  if (normalizedName.error != null) {
    return { path: '', dir, error: normalizedName.error }
  }
  if (normalizedName.name === '') return { path: '', dir, error: null }
  return { path: joinNotePath(dir, normalizedName.name), dir, error: null }
}

/** 新建提交说明：与编辑的「手机编辑：」区分。 */
export function buildCreateMessage(path: string): string {
  return `手机新建：${path}`
}
