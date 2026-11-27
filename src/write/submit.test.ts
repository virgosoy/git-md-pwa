import { describe, it, expect, afterEach, vi } from 'vitest'
import type { GithubClient } from '../github/client'
import { buildCommitMessage, createNote, SAVE_TIMEOUT_MS, submitNote } from './submit'

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

  it('新建：空正文、不带 sha、提交说明为「手机新建：<path>」', async () => {
    const putFile = vi.fn(async () => ({ sha: 'created' }))
    const client = fakeClient(putFile)

    const result = await createNote(client, repo, 'notes/哑值.md')

    expect(result).toEqual({ sha: 'created' })
    expect(putFile).toHaveBeenCalledWith(repo, 'notes/哑值.md', {
      content: '',
      message: '手机新建：notes/哑值.md'
    })
  })

  it('新建超时同样按网络错误抛出', async () => {
    vi.useFakeTimers()
    const never = new Promise<never>(() => {})
    const client = fakeClient(() => never)

    const pending = createNote(client, repo, 'a.md')
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'GithubError',
      status: 'network'
    })
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS)
    await assertion
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
