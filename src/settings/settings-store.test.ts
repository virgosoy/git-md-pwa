import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadSettings,
  saveSettings,
  clearSettings,
  DEFAULT_SETTINGS,
  isConfigured
} from './store'

// S1 · 设置存储：公共接口 loadSettings / saveSettings / clearSettings
// 测试数据一律用哑值（隐私红线：不出现任何真实仓库/令牌信息）

describe('settingsStore', () => {
  beforeEach(async () => {
    await clearSettings()
  })

  it('默认 autoSync 为开、renderMath/renderMermaid/tocPinned 为关，其余字段为空', async () => {
    const s = await loadSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(s.autoSync).toBe(true)
    expect(s.renderMath).toBe(false)
    expect(s.renderMermaid).toBe(false)
    expect(s.tocPinned).toBe(false)
  })

  it('保存后重新加载，往返保留 token/owner/repo/autoSync/renderMath/renderMermaid/tocPinned', async () => {
    await saveSettings({
      token: 'ghp_test_dummy',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false,
      renderMath: true,
      renderMermaid: true,
      tocPinned: true
    })
    const s = await loadSettings()
    expect(s).toEqual({
      token: 'ghp_test_dummy',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false,
      renderMath: true,
      renderMermaid: true,
      tocPinned: true
    })
  })

  it('clear 后回到默认值', async () => {
    await saveSettings({ owner: 'me', repo: 'fixtures' })
    await clearSettings()
    const s = await loadSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
  })

  it('部分更新只改指名字段，不丢其余', async () => {
    await saveSettings({ owner: 'a', repo: 'b' })
    await saveSettings({ repo: 'c', autoSync: false })
    const s = await loadSettings()
    expect(s).toEqual({
      token: '',
      owner: 'a',
      repo: 'c',
      autoSync: false,
      renderMath: false,
      renderMermaid: false,
      tocPinned: false
    })
  })

  it('renderMath 单独持久化：false→true 往返不丢', async () => {
    await saveSettings({ renderMath: true })
    expect((await loadSettings()).renderMath).toBe(true)
    await saveSettings({ renderMath: false })
    expect((await loadSettings()).renderMath).toBe(false)
  })

  it('renderMermaid 单独持久化：false→true 往返不丢', async () => {
    await saveSettings({ renderMermaid: true })
    expect((await loadSettings()).renderMermaid).toBe(true)
    await saveSettings({ renderMermaid: false })
    expect((await loadSettings()).renderMermaid).toBe(false)
  })

  it('tocPinned 单独持久化：false→true 往返不丢', async () => {
    await saveSettings({ tocPinned: true })
    expect((await loadSettings()).tocPinned).toBe(true)
    await saveSettings({ tocPinned: false })
    expect((await loadSettings()).tocPinned).toBe(false)
  })

  it('isConfigured：owner+repo 非空即视为已配置（公开库可不填令牌）', () => {
    expect(
      isConfigured({
        token: '',
        owner: 'me',
        repo: 'fixtures',
        autoSync: true,
        renderMath: false,
        renderMermaid: false,
        tocPinned: false
      })
    ).toBe(true)
    expect(
      isConfigured({
        token: 'x',
        owner: '',
        repo: 'fixtures',
        autoSync: true,
        renderMath: false,
        renderMermaid: false,
        tocPinned: false
      })
    ).toBe(false)
    expect(
      isConfigured({
        token: 'x',
        owner: 'me',
        repo: '',
        autoSync: true,
        renderMath: false,
        renderMermaid: false,
        tocPinned: false
      })
    ).toBe(false)
    expect(isConfigured(DEFAULT_SETTINGS)).toBe(false)
  })
})
