import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { selectMirrorFiles } from './tree'

// S2 · 树解析与镜像策略
// fixture 的真实部分来自公开仓库 octocat/Hello-World 的真实 trees 响应（形状锚定），
// 额外条目为同一 schema 的合成数据。

const fixture = JSON.parse(
  readFileSync(resolve('src/test/fixtures/hello-world-tree.json'), 'utf8')
)

describe('树解析与镜像策略', () => {
  it('从树响应拍平并只选中 .md 文件', () => {
    const selected = selectMirrorFiles(fixture.tree)
    expect(selected.map((f) => f.path)).toEqual([
      'docs/notes.md',
      'docs/medium.md',
      'docs/big-dump.md'
    ])
  })

  it('>10MB 的 md 标注为 too-large（未镜像），其余为 ok', () => {
    const byPath = Object.fromEntries(
      selectMirrorFiles(fixture.tree).map((f) => [f.path, f])
    )
    expect(byPath['docs/notes.md']?.status).toBe('ok')
    expect(byPath['docs/medium.md']?.status).toBe('ok')
    expect(byPath['docs/big-dump.md']?.status).toBe('too-large')
    expect(byPath['docs/big-dump.md']?.size).toBe(15000000)
    expect(byPath['docs/notes.md']?.sha).toBe(
      'c333333333333333333333333333333333333333'
    )
  })

  it('目录与非 md 一律剔除', () => {
    const paths = new Set(selectMirrorFiles(fixture.tree).map((f) => f.path))
    expect(paths.has('.github')).toBe(false)
    expect(paths.has('assets/logo.png')).toBe(false)
    expect(paths.has('.github/workflows/ci.yml')).toBe(false)
    expect(paths.has('README')).toBe(false)
  })
})
