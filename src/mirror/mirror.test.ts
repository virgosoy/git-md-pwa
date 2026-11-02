import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGithubClient } from '../github/client'
import { mirrorRepo } from './mirror'
import { loadFiles, getFile, loadMirrorMeta } from './store'
import { wipeDb } from '../test/wipeDb'

// S4 · 镜像编排：真实 client（注入 fake fetch）+ 真实 IndexedDB 存储的端到端。
// 隐私红线：token/repo 均为哑值。

const treeV1 = JSON.parse(
  readFileSync(resolve('src/test/fixtures/hello-world-tree.json'), 'utf8')
)

// 变更后的树：notes.md sha 变、medium.md 不变、新增 new.md、删掉 big-dump.md
const treeV2 = {
  sha: 'vvv2222',
  truncated: false,
  tree: [
    { path: 'docs/notes.md', mode: '100644', type: 'blob', sha: 'zz-new', size: 40 },
    {
      path: 'docs/medium.md',
      mode: '100644',
      type: 'blob',
      sha: 'e555555555555555555555555555555555555555',
      size: 750000
    },
    { path: 'docs/new.md', mode: '100644', type: 'blob', sha: 'nn-new-1', size: 20 }
  ]
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}
function raw(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain' } })
}

function makeServer() {
  const calls = { contents: 0 }
  let tree: unknown = treeV1
  const contents = new Map<string, string>([
    ['docs/notes.md', '# notes v1'],
    ['docs/medium.md', '# medium']
  ])

  const fetchFn = async (input: string | URL | Request): Promise<Response> => {
    const u = String(input)
    if (u.includes('/git/trees/HEAD')) return json(tree)
    const m = u.match(/contents\/([^?]+)\?ref=HEAD/)
    if (m) {
      calls.contents++
      const path = decodeURIComponent(m[1])
      if (!contents.has(path)) return json({ message: 'Not Found' }, 404)
      return raw(contents.get(path)!)
    }
    return json({ message: 'unknown route' }, 500)
  }

  return {
    fetch: fetchFn as typeof fetch,
    calls,
    setTree: (t: unknown) => {
      tree = t
    },
    setContent: (p: string, c: string) => contents.set(p, c),
    dropContent: (p: string) => contents.delete(p)
  }
}

const REPO = { owner: 'me', repo: 'fixtures' }

describe('mirrorRepo 编排', () => {
  beforeEach(async () => {
    await wipeDb()
  })
  afterEach(async () => {
    await wipeDb()
  })

  it('首次镜像：拉取 ok 文件、写入 too-large 占位、记录 meta', async () => {
    const srv = makeServer()
    const client = createGithubClient('ghp_test_dummy', srv.fetch)

    const res = await mirrorRepo(client, REPO)

    expect(res).toMatchObject({ fetched: 2, placeholders: 1, removed: 0 })
    expect(res.commitSha).toBe(treeV1.sha)

    const files = await loadFiles()
    expect(new Set(files.map((f) => f.path))).toEqual(
      new Set(['docs/notes.md', 'docs/medium.md', 'docs/big-dump.md'])
    )
    const big = files.find((f) => f.path === 'docs/big-dump.md')!
    expect(big.status).toBe('too-large')
    expect(big.content).toBe('')
    expect(await loadMirrorMeta()).toEqual({
      commitSha: treeV1.sha,
      syncedAt: expect.any(Number)
    })
  })

  it('未变不拉：同一棵树再同步不发一次内容请求', async () => {
    const srv = makeServer()
    const client = createGithubClient('ghp_test_dummy', srv.fetch)
    await mirrorRepo(client, REPO)

    const before = srv.calls.contents
    const res = await mirrorRepo(client, REPO)

    expect(srv.calls.contents - before).toBe(0)
    expect(res.fetched).toBe(0)
  })

  it('增量：sha 变更与新增文件被拉取、被移除文件被删除', async () => {
    const srv = makeServer()
    const client = createGithubClient('ghp_test_dummy', srv.fetch)
    await mirrorRepo(client, REPO)

    srv.setTree(treeV2)
    srv.setContent('docs/notes.md', '# notes v2')
    srv.setContent('docs/new.md', '# new')

    const res = await mirrorRepo(client, REPO)

    expect(res).toMatchObject({ fetched: 2, placeholders: 0, removed: 1 })
    const files = await loadFiles()
    expect(new Set(files.map((f) => f.path))).toEqual(
      new Set(['docs/notes.md', 'docs/medium.md', 'docs/new.md'])
    )
    expect((await getFile('docs/notes.md'))?.content).toBe('# notes v2')
  })

  it('失败不破坏旧镜像：拉取中途报错，库保持原样', async () => {
    const srv = makeServer()
    const client = createGithubClient('ghp_test_dummy', srv.fetch)
    await mirrorRepo(client, REPO)

    srv.setTree(treeV2)
    srv.dropContent('docs/notes.md') // 让 notes 拉取变 404

    await expect(mirrorRepo(client, REPO)).rejects.toThrow()

    // 旧镜像与旧 meta 原封不动
    const files = await loadFiles()
    expect(new Set(files.map((f) => f.path))).toEqual(
      new Set(['docs/notes.md', 'docs/medium.md', 'docs/big-dump.md'])
    )
    expect((await getFile('docs/notes.md'))?.content).toBe('# notes v1')
    expect(await loadMirrorMeta()).toEqual({
      commitSha: treeV1.sha,
      syncedAt: expect.any(Number)
    })
  })

  it('截断树（truncated）中止同步，不写任何数据', async () => {
    const srv = makeServer()
    const client = createGithubClient('ghp_test_dummy', srv.fetch)
    srv.setTree({ ...treeV1, truncated: true })

    await expect(mirrorRepo(client, REPO)).rejects.toThrow(/单次接口上限/)

    expect(await loadFiles()).toEqual([])
    expect(await loadMirrorMeta()).toBeNull()
  })
})
