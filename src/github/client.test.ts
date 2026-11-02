import { describe, it, expect } from 'vitest'
import { createGithubClient } from './client'

// S1 · GitHub 客户端
// 测试数据一律哑值（隐私红线）。通过注入 fetch 断言请求形态。

interface Log {
  urls: string[]
  inits: RequestInit[]
}

function makeFakeFetch(body: unknown, status = 200): [typeof fetch, Log] {
  const log: Log = { urls: [], inits: [] }
  const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    log.urls.push(String(url))
    log.inits.push(init ?? {})
    const payload = typeof body === 'string' ? body : JSON.stringify(body)
    return new Response(payload, {
      status,
      statusText: status === 200 ? 'OK' : 'Not Found'
    })
  }
  return [fn as typeof fetch, log]
}

describe('GithubClient', () => {
  it('getTree 请求 URL 正确，带 Bearer 且绝不含 X-GitHub-Api-Version', async () => {
    const [fetch, log] = makeFakeFetch({ tree: [] })
    const client = createGithubClient('ghp_test_dummy', fetch)
    await client.getTree({ owner: 'me', repo: 'fixtures' })

    expect(log.urls[0]).toBe(
      'https://api.github.com/repos/me/fixtures/git/trees/HEAD?recursive=1'
    )
    const headers = log.inits[0].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer ghp_test_dummy')
    expect(headers['X-GitHub-Api-Version']).toBeUndefined()
  })

  it('getRawFile 走 contents 端点、Accept 为 raw 媒体类型，返回原文', async () => {
    const [fetch, log] = makeFakeFetch('# hi', 200)
    const client = createGithubClient('t', fetch)
    const text = await client.getRawFile({ owner: 'me', repo: 'fixtures' }, 'docs/notes.md')

    expect(log.urls[0]).toBe(
      'https://api.github.com/repos/me/fixtures/contents/docs/notes.md?ref=HEAD'
    )
    const headers = log.inits[0].headers as Record<string, string>
    expect(headers.Accept).toBe('application/vnd.github.raw+json')
    expect(text).toBe('# hi')
  })

  it('非 2xx 抛 GithubError，带状态码与可读信息', async () => {
    const [fetch] = makeFakeFetch({ message: 'Not Found' }, 404)
    const client = createGithubClient('t', fetch)
    await expect(client.getTree({ owner: 'me', repo: 'fixtures' })).rejects.toMatchObject({
      name: 'GithubError',
      status: 404,
      message: 'GitHub 404：Not Found'
    })
  })

  it('网络失败抛 status 为 network 的 GithubError', async () => {
    const networkFetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    const client = createGithubClient('t', networkFetch)
    await expect(client.getTree({ owner: 'me', repo: 'fixtures' })).rejects.toMatchObject({
      name: 'GithubError',
      status: 'network'
    })
  })
})
