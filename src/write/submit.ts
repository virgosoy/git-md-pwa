// 提交编排：给单个文件写一个 commit；成功后返回新 blob sha。
// 不做本地 Git 工作副本；直接走 Contents API（ADR-0005）。

import { GithubError } from '../github/client'
import type { GithubClient, PutFileInput, PutFileResult, Repository } from '../github/client'
import { withTimeoutReject } from '../lib/async'
import { buildCreateMessage } from './newNote'

export const SAVE_TIMEOUT_MS = 30_000

export function buildCommitMessage(path: string): string {
  return `手机编辑：${path}`
}

function putWithTimeout(
  client: GithubClient,
  repo: Repository,
  path: string,
  input: PutFileInput
): Promise<PutFileResult> {
  return withTimeoutReject(
    client.putFile(repo, path, input),
    SAVE_TIMEOUT_MS,
    () => new GithubError('请求超时', 'network')
  )
}

export interface SubmitNoteInput {
  path: string
  /** 已按原文件行尾还原的正文 */
  content: string
  /** 更新必填；新建（远端已删除后重新创建）省略 */
  sha?: string
}

/** 提交单个文件；超时按网络错误处理（草稿保留，可重试）。 */
export async function submitNote(
  client: GithubClient,
  repo: Repository,
  input: SubmitNoteInput
): Promise<PutFileResult> {
  return putWithTimeout(client, repo, input.path, {
    content: input.content,
    sha: input.sha,
    message: buildCommitMessage(input.path)
  })
}

/** 新建空文件：省略 sha（存在即 422，由调用方 GET 确认重名）；超时同上。 */
export async function createNote(
  client: GithubClient,
  repo: Repository,
  path: string
): Promise<PutFileResult> {
  return putWithTimeout(client, repo, path, {
    content: '',
    message: buildCreateMessage(path)
  })
}
