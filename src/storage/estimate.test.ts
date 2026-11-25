import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { estimateStorage } from './estimate'
import { saveMirrorMeta, upsertFile } from '../mirror/store'
import { saveAsset } from '../assets/store'
import { saveScroll } from '../reader/reading'
import { saveSettings } from '../settings/store'
import { saveDraft } from '../write/draft'
import { wipeDb } from '../test/wipeDb'
import { installFakeCaches } from '../test/fakeCaches'

// 本机存储统计：逐类真实读取 IDB 五表 + Cache Storage。
// 断言用人工推导的已知字面量（字节口径：Latin-1 1 B/字符、UTF-16 2 B/字符、数字 8 B、布尔 1 B）。

describe('estimateStorage', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function seed(): Promise<void> {
    await upsertFile({ path: 'a.md', sha: 's1', content: 'héllo', size: 5, status: 'ok' })
    await upsertFile({ path: 'b.md', sha: 's2', content: '中文', size: 6, status: 'ok' })
    await upsertFile({
      path: 'big.md',
      sha: 's3',
      content: '',
      size: 10485761,
      status: 'too-large'
    })
    await saveAsset({
      path: 'img/a.png',
      dataUrl: 'data:image/png;base64,AA==',
      size: 1,
      status: 'ok',
      savedAt: 1
    })
    await saveAsset({ path: 'img/big.png', size: 10485761, status: 'too-large', savedAt: 1 })
    await saveMirrorMeta({ commitSha: 'abc123', syncedAt: 1000 })
    await saveSettings({ token: 'ghp_test_dummy', owner: 'me', repo: 'fixtures' })
    await saveScroll('a.md', 100)
    await saveDraft({
      path: 'a.md',
      content: '草稿',
      baseSha: 's1',
      eol: 'lf',
      updatedAt: 1
    })
  }

  it('分类统计与字节口径（IDB + Cache Storage）', async () => {
    await seed()
    installFakeCaches([
      {
        url: 'https://example.test/a.js',
        body: new Uint8Array(5),
        headers: { 'content-type': 'text/javascript' }
      }
    ])

    const u = await estimateStorage()

    // 笔记：a.md 20 + b.md 20 + big.md 31；正文 5 + 4
    expect(u.notes).toEqual({ count: 2, skipped: 1, contentBytes: 9, overheadBytes: 71 })
    // 资源：dataURL 26；oc 记录 36 + 占位 47
    expect(u.assets).toEqual({ count: 1, skipped: 1, contentBytes: 26, overheadBytes: 83 })
    // 缓存：响应体 5；URL 25 + 头 31 + 状态 8
    expect(u.cache).toEqual({ count: 1, skipped: 0, contentBytes: 5, overheadBytes: 64 })
    // 设置 31（7 个布尔）+ meta 14 + reading 20；键 'app'/'meta'/a.md 重复
    expect(u.settings).toEqual({ count: 3, skipped: 0, contentBytes: 65, overheadBytes: 11 })
    // 草稿：正文 4；path 两遍 8 + baseSha 2 + eol 2 + updatedAt 8
    expect(u.drafts).toEqual({ count: 1, skipped: 0, contentBytes: 4, overheadBytes: 20 })
  })

  it('某一类读取失败：该类为 null，其它类照常', async () => {
    await seed()
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('denied')
      }
    })

    const u = await estimateStorage()

    expect(u.cache).toBeNull()
    expect(u.notes).not.toBeNull()
    expect(u.assets).not.toBeNull()
    expect(u.settings).not.toBeNull()
    expect(u.drafts).not.toBeNull()
  })
})
