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

  it('空令牌不发送 Authorization（公开仓库匿名读）', async () => {
    const [fetch, log] = makeFakeFetch({ tree: [] })
    const client = createGithubClient('', fetch)
    await client.getTree({ owner: 'me', repo: 'fixtures' })

    const headers = log.inits[0].headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(log.urls[0]).toBe(
      'https://api.github.com/repos/me/fixtures/git/trees/HEAD?recursive=1'
    )
  })

  it('getRawBytes 返回原始字节（资源懒加载用）', async () => {
    const log: Log = { urls: [], inits: [] }
    const rawFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      log.urls.push(String(url))
      log.inits.push(init ?? {})
      return new Response(new Uint8Array([104, 105]))
    }) as typeof fetch
    const client = createGithubClient('t', rawFetch)
    const bytes = await client.getRawBytes({ owner: 'me', repo: 'fixtures' }, 'img/a.png')
    expect(Array.from(bytes)).toEqual([104, 105])
    expect(log.urls[0]).toContain('contents/img/a.png?ref=HEAD')
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

describe('GithubClient 回写', () => {
  it('getFileContent 解析 base64 正文与 blob sha', async () => {
    const log: Log = { urls: [], inits: [] }
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      log.urls.push(String(url))
      log.inits.push(init ?? {})
      return new Response(
        JSON.stringify({ sha: 'b1', content: '5Lit5paHCg==', encoding: 'base64', size: 7 }),
        { status: 200 }
      )
    }) as typeof fetch
    const client = createGithubClient('t', fakeFetch)

    const file = await client.getFileContent({ owner: 'me', repo: 'fixtures' }, 'docs/notes.md')

    expect(file).toEqual({ sha: 'b1', content: '中文\n' })
    expect(log.urls[0]).toBe(
      'https://api.github.com/repos/me/fixtures/contents/docs/notes.md?ref=HEAD'
    )
    expect((log.inits[0].headers as Record<string, string>).Accept).toBe(
      'application/vnd.github+json'
    )
  })

  it('getFileContent 超过 1MB（无内联 content）时回退 raw 取正文', async () => {
    const log: Log = { urls: [], inits: [] }
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      log.urls.push(String(url))
      log.inits.push(init ?? {})
      const accept = (init?.headers as Record<string, string>).Accept
      if (accept === 'application/vnd.github.raw+json') return new Response('# big')
      return new Response(
        JSON.stringify({ sha: 'b2', content: '', encoding: 'none', size: 2000000 }),
        { status: 200 }
      )
    }) as typeof fetch
    const client = createGithubClient('t', fakeFetch)

    const file = await client.getFileContent({ owner: 'me', repo: 'fixtures' }, 'big.md')

    expect(file).toEqual({ sha: 'b2', content: '# big' })
    expect(log.urls).toHaveLength(2)
  })

  it('putFile 走 PUT、base64 正文 + sha + message，且不带 API 版本头', async () => {
    const log: Log = { urls: [], inits: [] }
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      log.urls.push(String(url))
      log.inits.push(init ?? {})
      return new Response(JSON.stringify({ content: { sha: 'new' }, commit: { sha: 'c1' } }), {
        status: 200
      })
    }) as typeof fetch
    const client = createGithubClient('t', fakeFetch)

    const result = await client.putFile({ owner: 'me', repo: 'fixtures' }, 'a.md', {
      content: '# hi\n',
      sha: 'old',
      message: '手机编辑：a.md'
    })

    expect(result).toEqual({ sha: 'new', commitSha: 'c1' })
    expect(log.urls[0]).toBe(
      'https://api.github.com/repos/me/fixtures/contents/a.md'
    )
    const init = log.inits[0]
    expect(init.method).toBe('PUT')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer t')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-GitHub-Api-Version']).toBeUndefined()
    expect(JSON.parse(String(init.body))).toEqual({
      message: '手机编辑：a.md',
      content: 'IyBoaQo=',
      sha: 'old'
    })
  })

  it('putFile 省略 sha 时不发送该字段（新建文件）', async () => {
    const log: Log = { urls: [], inits: [] }
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      log.urls.push(String(url))
      log.inits.push(init ?? {})
      return new Response(JSON.stringify({ content: { sha: 'new' }, commit: { sha: 'c1' } }), {
        status: 201
      })
    }) as typeof fetch
    const client = createGithubClient('t', fakeFetch)

    await client.putFile({ owner: 'me', repo: 'fixtures' }, 'a.md', {
      content: '',
      message: '手机编辑：a.md'
    })

    expect(JSON.parse(String(log.inits[0].body))).toEqual({
      message: '手机编辑：a.md',
      content: ''
    })
  })
})
