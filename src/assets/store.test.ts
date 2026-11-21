import { describe, it, expect, beforeEach } from 'vitest'
import { saveAsset, loadAsset, removeAsset, clearCachedAssets } from './store'
import { wipeDb } from '../test/wipeDb'

// S2 · 资源缓存存储：dataURL round-trip、缺失、幂等覆盖

describe('资产存储', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('round-trip；缺失为 undefined', async () => {
    expect(await loadAsset('img/a.png')).toBeUndefined()
    await saveAsset({ path: 'img/a.png', dataUrl: 'data:image/png;base64,aGk=', size: 2, status: 'ok', savedAt: 1 })
    expect(await loadAsset('img/a.png')).toMatchObject({ dataUrl: 'data:image/png;base64,aGk=', status: 'ok' })
  })

  it('同路径覆盖幂等', async () => {
    await saveAsset({ path: 'a.png', dataUrl: 'v1', size: 1, status: 'ok', savedAt: 1 })
    await saveAsset({ path: 'a.png', dataUrl: 'v2', size: 2, status: 'ok', savedAt: 2 })
    expect((await loadAsset('a.png'))?.dataUrl).toBe('v2')
  })

  it('removeAsset 删除', async () => {
    await saveAsset({ path: 'a.png', dataUrl: 'v1', size: 1, status: 'ok', savedAt: 1 })
    await removeAsset('a.png')
    expect(await loadAsset('a.png')).toBeUndefined()
  })

  it('clearCachedAssets 只清已缓存资源，保留超大占位，返回条数与 dataURL 字节', async () => {
    // 'data:image/png;base64,AAAA' = 26 B/字符（全 ASCII）
    await saveAsset({ path: 'a.png', dataUrl: 'data:image/png;base64,AAAA', size: 3, status: 'ok', savedAt: 1 })
    await saveAsset({ path: 'b.png', dataUrl: 'data:image/png;base64,BBBB', size: 3, status: 'ok', savedAt: 1 })
    await saveAsset({ path: 'huge.png', size: 999, status: 'too-large', savedAt: 1 })

    expect(await clearCachedAssets()).toEqual({ count: 2, bytes: 52 })
    expect(await loadAsset('a.png')).toBeUndefined()
    expect(await loadAsset('b.png')).toBeUndefined()
    expect(await loadAsset('huge.png')).toMatchObject({ status: 'too-large', size: 999 })
  })

  it('clearCachedAssets 无缓存时返回 0', async () => {
    expect(await clearCachedAssets()).toEqual({ count: 0, bytes: 0 })
  })
})
