// S1 · GitHub REST 客户端
// 只读操作：拉取仓库文件树（git trees）与单文件原文（contents raw）。
// 关键约束：浏览器环境下绝不能发送 X-GitHub-Api-Version 请求头（会触发 CORS 预检失败）。

export interface Repository {
  owner: string
  repo: string
}

export interface TreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

export interface GitTreeResponse {
  sha: string
  tree: TreeEntry[]
  truncated: boolean
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number | 'network',
    readonly details?: string
  ) {
    super(message)
    this.name = 'GithubError'
  }
}

export interface GithubClient {
  /** 默认分支（HEAD）的整棵树，recursive=1 拍平 */
  getTree(repo: Repository): Promise<GitTreeResponse>
  /** 单个文件原文（0–100MB 均可，raw 媒体类型单一路径） */
  getRawFile(repo: Repository, path: string): Promise<string>
  /** 单个文件原始字节（资源懒加载用；同上 raw 端点） */
  getRawBytes(repo: Repository, path: string): Promise<Uint8Array>
}

const BASE = 'https://api.github.com'

function encodePath(path: string): string {
  return path
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

export function createGithubClient(
  token: string,
  fetchFn: typeof fetch = fetch
): GithubClient {
  async function request(url: string, accept: string): Promise<Response> {
    let res: Response
    try {
      const headers: Record<string, string> = { Accept: accept }
      // 空令牌（公开仓库）不加认证头，走匿名只读
      if (token.length > 0) headers.Authorization = `Bearer ${token}`
      res = await fetchFn(url, {
        headers
        // 注意：绝不加 X-GitHub-Api-Version
      })
    } catch (err) {
      throw new GithubError(
        `网络错误：${err instanceof Error ? err.message : String(err)}`,
        'network'
      )
    }
    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = (await res.json()) as { message?: string } | undefined
        if (body && typeof body.message === 'string') detail = body.message
      } catch {
        // 非 JSON 错误体，保留 statusText
      }
      throw new GithubError(`GitHub ${res.status}：${detail}`, res.status, detail)
    }
    return res
  }

  return {
    async getTree(repo) {
      const url = `${BASE}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/HEAD?recursive=1`
      const res = await request(url, 'application/json')
      return (await res.json()) as GitTreeResponse
    },

    async getRawFile(repo, path) {
      const res = await fetchRaw(repo, path)
      return res.text()
    },

    async getRawBytes(repo, path) {
      const res = await fetchRaw(repo, path)
      return new Uint8Array(await res.arrayBuffer())
    }
  }

  async function fetchRaw(repo: Repository, path: string): Promise<Response> {
    const url = `${BASE}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodePath(path)}?ref=HEAD`
    return request(url, 'application/vnd.github.raw+json')
  }
}
