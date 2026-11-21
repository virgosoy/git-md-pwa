import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearMirror,
  loadMirrorMeta,
  saveMirrorMeta,
  upsertFile,
  getFile,
  loadFiles,
  removeFiles,
  diffWithRemote
} from './store'
import { listRecent, saveScroll } from '../reader/reading'
import { loadSettings, saveSettings } from '../settings/store'
import type { MirrorFile } from './tree'
import type { StoredFile } from './store'
import { wipeDb } from '../test/wipeDb'

// S3 · 镜像存储（IndexedDB round-trip + 增量 diff）
// 测试数据一律哑值；每次测试前用全新数据库，避免污染。

function file(path: string, sha: string, status: MirrorFile['status'], size = 10): MirrorFile {
  return { path, sha, size, status }
}

function stored(path: string, sha: string, content = `# ${path}`): StoredFile {
  return { path, sha, content, size: 10, status: 'ok' }
}

describe('diffWithRemote（纯函数）', () => {
  it('全新镜像：所有 ok 文件要拉取，too-large 文件写占位', () => {
    const remote = [file('a.md', 's1', 'ok'), file('big.md', 's2', 'too-large')]
    const d = diffWithRemote([], remote)
    expect(d.fetch.map((f) => f.path)).toEqual(['a.md'])
    expect(d.placeholder.map((f) => f.path)).toEqual(['big.md'])
    expect(d.remove).toEqual([])
  })

  it('未变不拉：sha 与状态一致的本地文件不重复下载', () => {
    const remote = [file('a.md', 's1', 'ok')]
    const local = [stored('a.md', 's1')]
    const d = diffWithRemote(local, remote)
    expect(d.fetch).toEqual([])
    expect(d.remove).toEqual([])
  })

  it('sha 变更的文件才拉取，未变的跳过', () => {
    const remote = [file('a.md', 'new1', 'ok'), file('b.md', 's2', 'ok')]
    const local = [stored('a.md', 'old1'), stored('b.md', 's2')]
    const d = diffWithRemote(local, remote)
    expect(d.fetch.map((f) => f.path)).toEqual(['a.md'])
  })

  it('too-large → ok：转入拉取；ok → too-large：转入占位', () => {
    const remote = [file('flip.md', 's9', 'ok'), file('grow.md', 's8', 'too-large')]
    const local = [
      { ...stored('flip.md', 's9'), status: 'too-large' as const, content: '' },
      stored('grow.md', 's8')
    ]
    const d = diffWithRemote(local, remote)
    expect(d.fetch.map((f) => f.path)).toEqual(['flip.md'])
    expect(d.placeholder.map((f) => f.path)).toEqual(['grow.md'])
  })

  it('删除：本地有、远端已无的文件进入 remove', () => {
    const remote = [file('a.md', 's1', 'ok')]
    const local = [stored('a.md', 's1'), stored('old.md', 's9')]
    const d = diffWithRemote(local, remote)
    expect(d.remove).toEqual(['old.md'])
  })
})

describe('镜像存储（IndexedDB）', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('meta 往返；未保存时为 null', async () => {
    expect(await loadMirrorMeta()).toBeNull()
    await saveMirrorMeta({ commitSha: 'abc123', syncedAt: 1000 })
    expect(await loadMirrorMeta()).toEqual({ commitSha: 'abc123', syncedAt: 1000 })
  })

  it('文件 upsert/get/loadFiles 往返，重复写入覆盖', async () => {
    await upsertFile(stored('a.md', 's1'))
    await upsertFile(stored('b.md', 's2'))
    await upsertFile(stored('a.md', 's1b', '# a v2'))

    expect((await getFile('a.md'))?.content).toBe('# a v2')
    expect(await getFile('nope.md')).toBeUndefined()

    const all = await loadFiles()
    expect(new Set(all.map((f) => f.path))).toEqual(new Set(['a.md', 'b.md']))
  })

  it('removeFiles 按路径删除', async () => {
    await upsertFile(stored('a.md', 's1'))
    await upsertFile(stored('b.md', 's2'))
    await removeFiles(['a.md'])
    const all = await loadFiles()
    expect(all.map((f) => f.path)).toEqual(['b.md'])
  })
})

describe('clearMirror（清空本机笔记镜像）', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('清空镜像、同步记录与阅读数据，保留设置与资源', async () => {
    await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
    await upsertFile({ path: 'b.md', sha: 's2', content: '中文', size: 6, status: 'ok' })
    await upsertFile({
      path: 'big.md',
      sha: 's3',
      content: '',
      size: 10485761,
      status: 'too-large'
    })
    await saveMirrorMeta({ commitSha: 'abc123', syncedAt: 1000 })
    await saveScroll('a.md', 42)
    await saveSettings({ token: 'ghp_test_dummy', owner: 'me', repo: 'fixtures' })

    // 'hi' = 2 B，'中文' = 4 B；占位正文为空不计字节
    expect(await clearMirror()).toEqual({ count: 2, skipped: 1, bytes: 6 })

    expect(await loadFiles()).toEqual([])
    expect(await loadMirrorMeta()).toBeNull()
    expect(await listRecent()).toEqual([])
    const s = await loadSettings()
    expect(s.owner).toBe('me')
    expect(s.repo).toBe('fixtures')
    expect(s.token).toBe('ghp_test_dummy')
  })

  it('空库返回零，不抛错', async () => {
    expect(await clearMirror()).toEqual({ count: 0, skipped: 0, bytes: 0 })
    expect(await loadFiles()).toEqual([])
  })
})
