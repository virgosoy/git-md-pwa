import { describe, it, expect } from 'vitest'
import { GithubError } from '../github/client'
import { classifyWriteError } from './errors'

describe('写错误分类', () => {
  it('网络 / 401 / 403 / 404', () => {
    expect(classifyWriteError(new GithubError('offline', 'network'))).toEqual({
      kind: 'network',
      message: '网络错误或请求超时'
    })
    expect(classifyWriteError(new GithubError('bad', 401)).kind).toBe('auth')
    expect(classifyWriteError(new GithubError('nope', 403))).toEqual({
      kind: 'forbidden',
      message: '当前令牌没有写权限，请到设置换成 Contents: Read and write 的令牌'
    })
    expect(classifyWriteError(new GithubError('GitHub 404：Not Found', 404))).toEqual({
      kind: 'not-found',
      message: 'GitHub 404：Not Found'
    })
  })

  it('409 / 422 默认为疑似冲突；422 带 too large 归为过大', () => {
    expect(classifyWriteError(new GithubError('conflict', 409)).kind).toBe('conflict')
    expect(classifyWriteError(new GithubError('validation', 422)).kind).toBe('conflict')
    expect(
      classifyWriteError(
        new GithubError(
          'GitHub 422：Sorry, the file is too large to be processed.',
          422,
          'Sorry, the file is too large to be processed.'
        )
      ).kind
    ).toBe('too-large')
    expect(classifyWriteError(new GithubError('payload', 413)).kind).toBe('too-large')
  })

  it('其他 API 错误与普通异常', () => {
    expect(classifyWriteError(new GithubError('server', 500))).toEqual({
      kind: 'api',
      message: 'server'
    })
    expect(classifyWriteError(new Error('boom'))).toEqual({ kind: 'api', message: 'boom' })
    expect(classifyWriteError('x')).toEqual({ kind: 'api', message: 'x' })
  })
})
