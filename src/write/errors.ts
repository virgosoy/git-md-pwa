// 写错误分类：把 GitHub / 网络错误映射成 UI 可处理的类型。
// 409 与 422 都先按「疑似冲突」处理；调用方会 GET 远端文件再区分
// 「sha 不匹配」「文件已删除」「文件过大」「其他校验错误」。

import { GithubError } from '../github/client'

export type WriteFailKind =
  | 'network'
  | 'auth'
  | 'forbidden'
  | 'not-found'
  | 'too-large'
  | 'conflict'
  | 'api'

export interface WriteFailure {
  kind: WriteFailKind
  message: string
}

function isTooLarge(detail: string): boolean {
  return /too large/i.test(detail)
}

export function classifyWriteError(err: unknown): WriteFailure {
  if (err instanceof GithubError) {
    switch (err.status) {
      case 'network':
        return { kind: 'network', message: '网络错误或请求超时' }
      case 401:
        return {
          kind: 'auth',
          message: `令牌无效或已过期：${err.details ?? err.message}。请到设置更新令牌`
        }
      case 403:
        return {
          kind: 'forbidden',
          message: '当前令牌没有写权限，请到设置换成 Contents: Read and write 的令牌'
        }
      case 404:
        return { kind: 'not-found', message: err.message }
      case 409:
        return { kind: 'conflict', message: '远端文件已更新' }
      case 413:
        return { kind: 'too-large', message: '文件过大，GitHub 拒绝了这次提交' }
      case 422:
        if (isTooLarge(err.details ?? '') || isTooLarge(err.message)) {
          return { kind: 'too-large', message: '文件过大，GitHub 拒绝了这次提交' }
        }
        return { kind: 'conflict', message: '远端文件已更新' }
      default:
        return { kind: 'api', message: err.message }
    }
  }
  return {
    kind: 'api',
    message: err instanceof Error ? err.message : String(err)
  }
}
