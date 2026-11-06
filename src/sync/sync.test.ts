import { describe, it, expect, beforeEach } from 'vitest'
import { GithubError } from '../github/client'
import type { GithubClient, Repository } from '../github/client'
import { runSync, classifySyncError } from './sync'
import { wipeDb } from '../test/wipeDb'

// S2 · 同步编排：把 mirrorRepo 的抛错映射成给 UI 的 typed 结果。
// 镜像增量本身由 02 的 mirrorRepo 测试覆盖，这里只测编排与分类。

const REPO: Repository = { owner: 'me', repo: 'fixtures' }

function clientWithTree(tree: unknown): GithubClient {
  return {
    async getTree() {
      return tree as never
    },
    async getRawFile() {
      return ''
    },
    async getRawBytes() {
      return new Uint8Array(0)
    }
  }
}

describe('runSync 编排与错误分类', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('成功 → synced + commitSha', async () => {
    const out = await runSync(clientWithTree({ sha: 'abc123', tree: [], truncated: false }), REPO)
    expect(out).toEqual({ status: 'synced', commitSha: 'abc123' })
  })

  it('网络失败 → failed/network', async () => {
    const c: GithubClient = {
      async getTree() {
        throw new GithubError('网络错误：Failed to fetch', 'network')
      },
      async getRawFile() {
        return ''
      },
      async getRawBytes() {
        return new Uint8Array(0)
      }
    }
    const out = await runSync(c, REPO)
    expect(out).toMatchObject({ status: 'failed', kind: 'network' })
  })

  it('API 失败 → failed/api 带可读信息', async () => {
    const c: GithubClient = {
      async getTree() {
        throw new GithubError('GitHub 404：Not Found', 404)
      },
      async getRawFile() {
        return ''
      },
      async getRawBytes() {
        return new Uint8Array(0)
      }
    }
    const out = await runSync(c, REPO)
    expect(out).toMatchObject({ status: 'failed', kind: 'api', message: 'GitHub 404：Not Found' })
  })

  it('截断树 → failed/truncated', async () => {
    const out = await runSync(clientWithTree({ sha: 'x', tree: [], truncated: true }), REPO)
    expect(out).toMatchObject({ status: 'failed', kind: 'truncated' })
  })

  it('classifySyncError 兜底未知错误', () => {
    expect(classifySyncError(new Error('boom')).kind).toBe('unknown')
    expect(classifySyncError('raw string').kind).toBe('unknown')
  })
})
