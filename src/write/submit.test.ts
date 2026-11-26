import { describe, it, expect, afterEach, vi } from 'vitest'
import type { GithubClient } from '../github/client'
import { buildCommitMessage, SAVE_TIMEOUT_MS, submitNote } from './submit'

const repo = { owner: 'me', repo: 'fixtures' }

function fakeClient(putFile: GithubClient['putFile']): GithubClient {
  return {
    getTree: vi.fn(),
    getRawFile: vi.fn(),
    getRawBytes: vi.fn(),
    getFileContent: vi.fn(),
    putFile
  } as unknown as GithubClient
}

afterEach(() => {
  vi.useRealTimers()
})

describe('提交编排', () => {
  it('提交说明固定为「手机编辑：<path>」', () => {
    expect(buildCommitMessage('docs/a.md')).toBe('手机编辑：docs/a.md')
  })

  it('把正文、sha 与提交说明传给客户端，并返回新 sha', async () => {
    const putFile = vi.fn(async () => ({ sha: 'new' }))
    const client = fakeClient(putFile)

    const result = await submitNote(client, repo, {
      path: 'a.md',
      content: '# hi\n',
      sha: 'old'
    })

    expect(result).toEqual({ sha: 'new' })
    expect(putFile).toHaveBeenCalledWith(repo, 'a.md', {
      content: '# hi\n',
      sha: 'old',
      message: '手机编辑：a.md'
    })
  })

  it('超时按网络错误抛出（草稿保留由调用方处理）', async () => {
    vi.useFakeTimers()
    const never = new Promise<never>(() => {})
    const client = fakeClient(() => never)

    const pending = submitNote(client, repo, { path: 'a.md', content: 'x', sha: 's' })
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'GithubError',
      status: 'network'
    })
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS)
    await assertion
  })
})
