// 提交编排：给单个文件写一个 commit；成功后返回新 blob sha。
// 不做本地 Git 工作副本；直接走 Contents API（ADR-0005）。

import { GithubError } from '../github/client'
import type { GithubClient, PutFileResult, Repository } from '../github/client'

export const SAVE_TIMEOUT_MS = 30_000

export function buildCommitMessage(path: string): string {
  return `手机编辑：${path}`
}

/** 超时抛网络错误；其它 rejection 原样透传（不能把 403/409 吞成超时）。 */
function withSaveTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new GithubError('请求超时', 'network'))
    }, ms)
    p.then(
      (v) => {
        window.clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      }
    )
  })
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
  return withSaveTimeout(
    client.putFile(repo, input.path, {
      content: input.content,
      sha: input.sha,
      message: buildCommitMessage(input.path)
    }),
    SAVE_TIMEOUT_MS
  )
}
