import { describe, it, expect, beforeEach } from 'vitest'
import type { GithubClient, Repository } from '../github/client'
import { ensureAsset, bytesToDataUrl, mimeFromPath } from './pipeline'
import { loadAsset } from './store'
import { wipeDb } from '../test/wipeDb'

// S3 · 资源管线：缓存命中零网络、首次拉取建缓存、>10MB 标占位

const REPO: Repository = { owner: 'me', repo: 'fixtures' }

function clientReturning(bytes: Uint8Array): GithubClient & { calls: number } {
  const state = { calls: 0 }
  return {
    get calls() {
      return state.calls
    },
    async getTree() {
      return { sha: 'x', tree: [], truncated: false } as never
    },
    async getRawFile() {
      return ''
    },
    async getRawBytes() {
      state.calls++
      return bytes
    }
  }
}

describe('ensureAsset', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('首次拉取：编码 dataURL 并入缓存', async () => {
    const client = clientReturning(new Uint8Array([104, 105]))
    const url = await ensureAsset(client, REPO, 'docs/img/a.png')
    expect(url).toBe('data:image/png;base64,aGk=')
    expect((await loadAsset('docs/img/a.png'))?.status).toBe('ok')
  })

  it('缓存命中：零网络请求返回既有 dataURL', async () => {
    const client = clientReturning(new Uint8Array([104, 105]))
    await ensureAsset(client, REPO, 'docs/img/a.png')
    const callsAfterFirst = client.calls
    const url = await ensureAsset(client, REPO, 'docs/img/a.png')
    expect(client.calls).toBe(callsAfterFirst)
    expect(url).toBe('data:image/png;base64,aGk=')
  })

  it('超过 10MB：标占位不入缓存，返回 null', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    const client = clientReturning(big)
    const url = await ensureAsset(client, REPO, 'docs/img/big.png')
    expect(url).toBeNull()
    const rec = await loadAsset('docs/img/big.png')
    expect(rec?.status).toBe('too-large')
    expect(rec?.dataUrl).toBeUndefined()
  })

  it('mimeFromPath 已知字面量', () => {
    expect(mimeFromPath('a/photo.png')).toBe('image/png')
    expect(mimeFromPath('a/manual.pdf')).toBe('application/pdf')
    expect(mimeFromPath('a/data.bin')).toBe('application/octet-stream')
  })

  it('bytesToDataUrl 已知字面量', () => {
    expect(bytesToDataUrl(new Uint8Array([104, 105]), 'image/png')).toBe(
      'data:image/png;base64,aGk='
    )
  })
})
