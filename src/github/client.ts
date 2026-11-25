// S1 · GitHub REST 客户端
// 读：拉取仓库文件树（git trees）、单文件原文（contents raw）、单文件 sha+正文（contents JSON）。
// 写：回写单个 Markdown 文件（contents PUT，带 blob sha 前置条件）。
// 关键约束：浏览器环境下绝不能发送 X-GitHub-Api-Version 请求头（会触发 CORS 预检失败）。

import { decodeUtf8Base64, encodeUtf8Base64 } from '../lib/base64'

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

/** contents JSON 端点返回的当前文件：sha 用于更新前置条件，正文已解码为字符串。 */
export interface FileContent {
  sha: string
  content: string
}

export interface PutFileInput {
  content: string
  /** 更新已有文件时必填：被替换文件的 blob sha（乐观并发前置条件） */
  sha?: string
  message: string
}

export interface PutFileResult {
  /** 新文件的 blob sha（用于回填本地镜像） */
  sha: string
  /** 新提交的 commit sha（当前不持久化） */
  commitSha: string
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
  /** 单个文件的当前 blob sha 与正文（冲突判定 / 远端预览） */
  getFileContent(repo: Repository, path: string): Promise<FileContent>
  /** 提交单个文件；更新时必须带 sha，省略 sha 表示新建 */
  putFile(repo: Repository, path: string, input: PutFileInput): Promise<PutFileResult>
}

const BASE = 'https://api.github.com'

function encodePath(path: string): string {
  return path
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

interface RequestOptions {
  method?: string
  body?: string
  contentType?: string
}

interface ContentsJson {
  sha?: string
  content?: string
  encoding?: string
  size?: number
}

export function createGithubClient(
  token: string,
  fetchFn: typeof fetch = fetch
): GithubClient {
  async function request(
    url: string,
    accept: string,
    opts: RequestOptions = {}
  ): Promise<Response> {
    let res: Response
    try {
      const headers: Record<string, string> = { Accept: accept }
      if (opts.contentType) headers['Content-Type'] = opts.contentType
      // 空令牌（公开仓库）不加认证头，走匿名只读
      if (token.length > 0) headers.Authorization = `Bearer ${token}`
      res = await fetchFn(url, {
        method: opts.method,
        body: opts.body,
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

  async function fetchRaw(repo: Repository, path: string): Promise<Response> {
    const url = `${BASE}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodePath(path)}?ref=HEAD`
    return request(url, 'application/vnd.github.raw+json')
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
    },

    async getFileContent(repo, path) {
      const url = `${BASE}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodePath(path)}?ref=HEAD`
      const res = await request(url, 'application/vnd.github+json')
      const json = (await res.json()) as ContentsJson
      if (typeof json.sha !== 'string') {
        throw new GithubError('GitHub 返回的文件信息缺少 sha', 0)
      }
      // 超过 1MB 时 contents JSON 不再内联 content，回退到 raw 取正文。
      if (json.encoding === 'base64' && typeof json.content === 'string' && json.content !== '') {
        return { sha: json.sha, content: decodeUtf8Base64(json.content) }
      }
      if ((json.size ?? 0) === 0) return { sha: json.sha, content: '' }
      const raw = await fetchRaw(repo, path)
      return { sha: json.sha, content: await raw.text() }
    },

    async putFile(repo, path, input) {
      const url = `${BASE}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${encodePath(path)}`
      const body: Record<string, string> = {
        message: input.message,
        content: encodeUtf8Base64(input.content)
      }
      if (input.sha) body.sha = input.sha
      const res = await request(url, 'application/vnd.github+json', {
        method: 'PUT',
        body: JSON.stringify(body),
        contentType: 'application/json'
      })
      const json = (await res.json()) as {
        content?: { sha?: string }
        commit?: { sha?: string }
      }
      if (!json.content?.sha || !json.commit?.sha) {
        throw new GithubError('GitHub 提交响应缺少 sha', 0)
      }
      return { sha: json.content.sha, commitSha: json.commit.sha }
    }
  }
}
