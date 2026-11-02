import { describe, it, expect, beforeEach } from 'vitest'
import { loadSettings, saveSettings, clearSettings, DEFAULT_SETTINGS } from './store'

// S1 · 设置存储：公共接口 loadSettings / saveSettings / clearSettings
// 测试数据一律用哑值（隐私红线：不出现任何真实仓库/令牌信息）

describe('settingsStore', () => {
  beforeEach(async () => {
    await clearSettings()
  })

  it('默认 autoSync 为开，其余字段为空', async () => {
    const s = await loadSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(s.autoSync).toBe(true)
  })

  it('保存后重新加载，往返保留 token/owner/repo/autoSync', async () => {
    await saveSettings({
      token: 'ghp_test_dummy',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false
    })
    const s = await loadSettings()
    expect(s).toEqual({
      token: 'ghp_test_dummy',
      owner: 'me',
      repo: 'fixtures',
      autoSync: false
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
      autoSync: false
    })
  })
})
