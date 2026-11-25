import { describe, it, expect, beforeEach } from 'vitest'
import {
  deleteDraft,
  listDraftPaths,
  loadDraft,
  loadDrafts,
  saveDraft
} from './draft'
import type { DraftRecord } from './draft'
import { wipeDb } from '../test/wipeDb'

function draft(path: string, content = '# hi'): DraftRecord {
  return { path, content, baseSha: `sha-${path}`, eol: 'lf', updatedAt: 1000 }
}

describe('草稿存储（IndexedDB）', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  it('按 path 往返；重复写入覆盖', async () => {
    await saveDraft(draft('a.md'))
    await saveDraft({ ...draft('a.md'), content: '# v2', updatedAt: 2000 })

    expect(await loadDraft('a.md')).toEqual({
      path: 'a.md',
      content: '# v2',
      baseSha: 'sha-a.md',
      eol: 'lf',
      updatedAt: 2000
    })
    expect(await loadDraft('nope.md')).toBeUndefined()
  })

  it('listDraftPaths / loadDrafts 按 path 排序；delete 后消失', async () => {
    await saveDraft(draft('b.md'))
    await saveDraft(draft('a.md'))

    expect(await listDraftPaths()).toEqual(['a.md', 'b.md'])
    expect((await loadDrafts()).map((d) => d.path)).toEqual(['a.md', 'b.md'])

    await deleteDraft('a.md')
    expect(await listDraftPaths()).toEqual(['b.md'])
    expect(await loadDraft('a.md')).toBeUndefined()
  })

  it('空库返回空数组', async () => {
    expect(await listDraftPaths()).toEqual([])
    expect(await loadDrafts()).toEqual([])
  })
})
