// U5 · 手动「检查更新」的反馈文案：纯映射，输入检查结果，输出设置页那行提示。
// 六种检查结果 × 是否已装好新构建 → 已知字面量，便于单测锁死。

import type { InstalledBuild } from './installed'

/** 一次 SW 更新检查的结果（ready=有 waiting SW 可接管） */
export type UpdateReadiness =
  | 'ready'
  | 'pending'
  | 'up-to-date'
  | 'failed'
  | 'timeout'
  | 'unavailable'

export interface ManualCheckInput {
  readiness: UpdateReadiness
  /** 线上 version.json 的版本串；null=没取到 */
  live: string | null
  /** 当前页面正在运行的版本串 */
  running: string
  /** SW 预缓存里的构建与当前页面是否一致 */
  installed: InstalledBuild
}

const RESTART_HINT = '请把 App 彻底关掉（上滑关闭）再重新打开'

export function manualCheckNote({ readiness, live, running, installed }: ManualCheckInput): string | null {
  if (readiness === 'ready') return null
  if (readiness === 'pending') return '更新正在下载，请稍后再试'
  if (installed === 'different') {
    return live ? `新版本 ${live} 已装好，${RESTART_HINT}` : `新版本已装好，${RESTART_HINT}`
  }
  if (live !== null && live === running) return '已是最新版本'
  if (readiness === 'failed') return '检查更新失败，请稍后再试'
  if (readiness === 'timeout') return '检查更新超时，请稍后再试'
  if (readiness === 'unavailable') return '更新检查尚未就绪，请稍后再试'
  // 到这里 readiness 只剩 up-to-date：SW 已是最新，但页面可能还跑旧构建
  if (live === null) return '已是最新版本'
  if (installed === 'same') return `线上已有 ${live}，但本机还没拿到更新包，请稍后再试`
  return `线上已有 ${live}（本机 ${running}）。如果刚更新过，请把 App 彻底关掉再打开；否则请稍后再试`
}

/**
 * 横幅「刷新」时等不到可接管 SW 的反馈。
 * 与手动检查共用一套文案，避免两处各写一份、后续改字漏一处。
 */
export function applyNotReadyNote(readiness: UpdateReadiness): string {
  if (readiness === 'pending') return '更新正在下载，请稍后再试'
  if (readiness === 'failed') return '检查更新失败，请稍后再试'
  if (readiness === 'timeout') return '检查更新超时，请稍后再试'
  return '更新还没准备好，请稍后再试'
}
