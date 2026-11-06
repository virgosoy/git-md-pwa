import { describe, it, expect, beforeEach } from 'vitest'
import { saveAsset, loadAsset, removeAsset } from './store'
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
})
