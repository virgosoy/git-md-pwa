import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from 'preact'
import { SettingsView } from './SettingsView'
import { loadSettings, saveSettings } from './store'
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

describe('SettingsView 资源自动下载开关（23）', () => {
  beforeEach(async () => {
    await wipeDb()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('默认勾选；取消并保存后落盘，重新加载为关闭', async () => {
    await saveSettings({ owner: 'me', repo: 'fixtures' })
    installFakeCaches([])
    const c = document.createElement('div')
    document.body.appendChild(c)
    render(<SettingsView onClose={() => {}} />, c)

    const label = [...c.querySelectorAll('label')].find((l) =>
      (l.textContent ?? '').includes('自动下载图片与附件')
    )
    expect(label).toBeTruthy()
    const box = label!.querySelector('input[type="checkbox"]') as HTMLInputElement
    await waitFor(() => !box.disabled)
    expect(box.checked).toBe(true)

    box.click()
    expect(box.checked).toBe(false)
    // Preact 批量更新：等 state 落地后再提交，否则 onSubmit 闭包还是旧 form
    await new Promise((r) => setTimeout(r, 0))

    ;(c.querySelector('button[type="submit"]') as HTMLButtonElement).click()
    await waitFor(() => (c.textContent ?? '').includes('已保存'))

    const s = await loadSettings()
    expect(s.autoDownloadAssets).toBe(false)
  })
})
