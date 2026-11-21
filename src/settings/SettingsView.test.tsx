import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { SettingsView } from './SettingsView'
import { upsertFile } from '../mirror/store'
import { wipeDb } from '../test/wipeDb'
import { installFakeCaches } from '../test/fakeCaches'
import { waitFor } from '../test/wait'

// 设置页接线：本机存储区块随设置页渲染并完成统计。

describe('SettingsView 本机存储', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('设置页包含「本机存储」区块并完成统计', async () => {
    await upsertFile({ path: 'a.md', sha: 's1', content: 'hi', size: 2, status: 'ok' })
    installFakeCaches([])
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<SettingsView onClose={() => {}} />, c)

    await waitFor(() => (c.textContent ?? '').includes('共 22 B'))
    expect(c.textContent).toContain('本机存储')
    expect(c.textContent).toContain('1 篇')
  })
})
