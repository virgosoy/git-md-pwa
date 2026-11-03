// S2 · 同步编排：把 mirrorRepo 的抛错映射成给 UI 的 typed 结果。
// 镜像增量逻辑本身在 mirrorRepo（票 02），这里提供应用层的编排与错误分类。

import { GithubError } from '../github/client'
import type { GithubClient, Repository } from '../github/client'
import { mirrorRepo, TruncatedError } from '../mirror/mirror'

export type SyncFailKind = 'network' | 'api' | 'truncated' | 'unknown'

export type SyncOutcome =
  | { status: 'synced'; commitSha: string }
  | { status: 'failed'; kind: SyncFailKind; message: string }

export function classifySyncError(err: unknown): { kind: SyncFailKind; message: string } {
  if (err instanceof GithubError) {
    if (err.status === 'network') return { kind: 'network', message: '离线' }
    return { kind: 'api', message: err.message }
  }
  if (err instanceof TruncatedError) return { kind: 'truncated', message: err.message }
  return { kind: 'unknown', message: err instanceof Error ? err.message : String(err) }
}

/** 执行一次同步；无论成败都不抛错，总是返回 typed 结果。 */
export async function runSync(
  client: GithubClient,
  repo: Repository
): Promise<SyncOutcome> {
  try {
    const result = await mirrorRepo(client, repo)
    return { status: 'synced', commitSha: result.commitSha }
  } catch (err) {
    return { status: 'failed', ...classifySyncError(err) }
  }
}
