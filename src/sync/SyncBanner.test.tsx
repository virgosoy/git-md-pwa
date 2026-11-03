import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'preact'
import type { ComponentChild } from 'preact'
import { SyncBanner } from './SyncBanner'
import type { SyncFailKind } from './sync'

// S3 · 同步横幅文案（票 04 的「离线 · 上次同步 x 分钟前」验收）

function mount(vnode: ComponentChild): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  render(vnode, c)
  return c
}

function text(c: HTMLElement): string {
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim()
}

const MIN = 60_000
const nothing: { kind: SyncFailKind; message: string } | null = null

describe('SyncBanner', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('同步中 → 提示文案', () => {
    const c = mount(
      <SyncBanner status="syncing" fail={nothing} lastSyncedAt={null} now={0} />
    )
    expect(text(c)).toContain('正在同步')
  })

  it('同步完成 → 显示上次同步时间', () => {
    const c = mount(
      <SyncBanner status="synced" fail={nothing} lastSyncedAt={5 * MIN} now={10 * MIN} />
    )
    expect(text(c)).toContain('上次同步 5 分钟前')
  })

  it('网络失败 → 「离线 · 上次同步 x 分钟前」', () => {
    const c = mount(
      <SyncBanner
        status="failed"
        fail={{ kind: 'network', message: '离线' }}
        lastSyncedAt={5 * MIN}
        now={10 * MIN}
      />
    )
    expect(text(c)).toBe('离线 · 上次同步 5 分钟前')
  })

  it('网络失败且从未同步 → 仅「离线」', () => {
    const c = mount(
      <SyncBanner
        status="failed"
        fail={{ kind: 'network', message: '离线' }}
        lastSyncedAt={null}
        now={0}
      />
    )
    expect(text(c)).toBe('离线')
  })

  it('API 失败 → 展示错误信息与上次同步时间', () => {
    const c = mount(
      <SyncBanner
        status="failed"
        fail={{ kind: 'api', message: 'GitHub 404：Not Found' }}
        lastSyncedAt={5 * MIN}
        now={10 * MIN}
      />
    )
    expect(text(c)).toBe('GitHub 404：Not Found · 上次同步 5 分钟前')
  })

  it('未开始且无数据 → 渲染为空', () => {
    const c = mount(
      <SyncBanner status="synced" fail={nothing} lastSyncedAt={null} now={0} />
    )
    expect(text(c)).toBe('')
  })
})
