import { describe, it, expect, vi } from 'vitest'
import { render } from 'preact'
import { UpdateBanner } from './UpdateBanner'

// U4 渲染测试：横幅纯展示，只断言字面量文案与回调接线。

function mount(live: string | null) {
  const c = document.createElement('div')
  document.body.appendChild(c)
  const onApply = vi.fn()
  const onIgnore = vi.fn()
  render(<UpdateBanner live={live} onApply={onApply} onIgnore={onIgnore} />, c)
  return { c, onApply, onIgnore }
}

describe('UpdateBanner', () => {
  it('取到新版本 → 显示版本号', () => {
    const { c } = mount('v0.0.2+zzz')
    expect(c.textContent).toContain('发现新版本 v0.0.2+zzz')
  })

  it('取不到版本 → 通用文案', () => {
    const { c } = mount(null)
    expect(c.textContent).toContain('发现新版本')
    expect(c.textContent).not.toContain('v0.0.2+zzz')
  })

  it('点「刷新」触发 onApply', () => {
    const { c, onApply, onIgnore } = mount('v0.0.2+zzz')
    const btn = Array.from(c.querySelectorAll('button')).find((b) => b.textContent === '刷新')
    expect(btn).toBeTruthy()
    btn!.click()
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onIgnore).not.toHaveBeenCalled()
  })

  it('点「稍后」触发 onIgnore 且不触发 onApply', () => {
    const { c, onApply, onIgnore } = mount('v0.0.2+zzz')
    const btn = Array.from(c.querySelectorAll('button')).find((b) => b.textContent === '稍后')
    expect(btn).toBeTruthy()
    btn!.click()
    expect(onIgnore).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })
})
