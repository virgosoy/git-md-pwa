// S4 · 镜像编排
// 一步同步：拉树 → 选 .md → 与本地比对出 diff → 先全部拉取内容，全部成功才写库。
// 两阶段是关键：任一网络失败整次同步中止，旧镜像与旧 meta 保持原样。

import type { GithubClient, Repository } from '../github/client'
import { selectMirrorFiles } from './tree'
import {
  diffWithRemote,
  loadFiles,
  loadMirrorMeta,
  removeFiles,
  saveMirrorMeta,
  upsertFile
} from './store'

export interface MirrorResult {
  commitSha: string
  fetched: number
  placeholders: number
  removed: number
}

export const TRUNCATED_ERROR =
  '仓库文件树已超出 GitHub 单次接口上限，为避免镜像不完整已中止同步'

export async function mirrorRepo(
  client: GithubClient,
  repo: Repository
): Promise<MirrorResult> {
  const tree = await client.getTree(repo)
  if (tree.truncated) {
    throw new Error(TRUNCATED_ERROR)
  }

  // 版本号门：整树未变则直接视为已最新，跳过 diff 与全部网络拉取。
  const meta = await loadMirrorMeta()
  if (meta && meta.commitSha === tree.sha) {
    return { commitSha: tree.sha, fetched: 0, placeholders: 0, removed: 0 }
  }

  const remote = selectMirrorFiles(tree.tree)
  const local = await loadFiles()
  const diff = diffWithRemote(local, remote)

  // 阶段一：网络。全部内容拉取成功才继续，否则直接抛错（库未动）。
  const fetched = await Promise.all(
    diff.fetch.map(async (f) => ({ file: f, content: await client.getRawFile(repo, f.path) }))
  )

  // 阶段二：写库。
  for (const { file, content } of fetched) {
    await upsertFile({ path: file.path, sha: file.sha, size: file.size, status: 'ok', content })
  }
  for (const f of diff.placeholder) {
    await upsertFile({ path: f.path, sha: f.sha, size: f.size, status: 'too-large', content: '' })
  }
  await removeFiles(diff.remove)
  await saveMirrorMeta({ commitSha: tree.sha, syncedAt: Date.now() })

  return {
    commitSha: tree.sha,
    fetched: diff.fetch.length,
    placeholders: diff.placeholder.length,
    removed: diff.remove.length
  }
}
