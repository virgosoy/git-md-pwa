import { describe, it, expect } from 'vitest'
import { applyNotReadyNote, manualCheckNote } from './manualNote'

const RUNNING = 'v0.0.1+aaa'
const LIVE = 'v0.0.2+zzz'

describe('manualCheckNote', () => {
  it('ready（有 waiting SW）→ 不写提示，交给更新横幅', () => {
    expect(
      manualCheckNote({ readiness: 'ready', live: LIVE, running: RUNNING, installed: 'unknown' })
    ).toBeNull()
  })

  it('pending（新 SW 还在安装）→ 提示正在下载', () => {
    expect(
      manualCheckNote({ readiness: 'pending', live: LIVE, running: RUNNING, installed: 'unknown' })
    ).toBe('更新正在下载，请稍后再试')
  })

  it('预缓存已是另一份构建 → 提示新版本已装好、彻底关掉 App 重开', () => {
    expect(
      manualCheckNote({ readiness: 'up-to-date', live: LIVE, running: RUNNING, installed: 'different' })
    ).toBe(`新版本 ${LIVE} 已装好，请把 App 彻底关掉（上滑关闭）再重新打开`)
  })

  it('预缓存已是另一份构建且取不到线上版本 → 不带版本号的「已装好」提示', () => {
    expect(
      manualCheckNote({ readiness: 'failed', live: null, running: RUNNING, installed: 'different' })
    ).toBe('新版本已装好，请把 App 彻底关掉（上滑关闭）再重新打开')
  })

  it('线上版本与本机相同 → 已是最新版本（即使 SW 检查失败也以线上版本为准）', () => {
    expect(
      manualCheckNote({ readiness: 'failed', live: RUNNING, running: RUNNING, installed: 'unknown' })
    ).toBe('已是最新版本')
  })

  it('update() 网络失败 → 检查失败提示，不再说「暂无可安装的更新包」', () => {
    expect(
      manualCheckNote({ readiness: 'failed', live: LIVE, running: RUNNING, installed: 'unknown' })
    ).toBe('检查更新失败，请稍后再试')
  })

  it('update() 超时 → 超时提示，不再谎称正在下载', () => {
    expect(
      manualCheckNote({ readiness: 'timeout', live: LIVE, running: RUNNING, installed: 'unknown' })
    ).toBe('检查更新超时，请稍后再试')
  })

  it('拿不到 registration → 尚未就绪提示', () => {
    expect(
      manualCheckNote({ readiness: 'unavailable', live: LIVE, running: RUNNING, installed: 'unknown' })
    ).toBe('更新检查尚未就绪，请稍后再试')
  })

  it('SW 无新版本、预缓存就是当前构建 → 线上版本串变了但本机没拿到更新包', () => {
    expect(
      manualCheckNote({ readiness: 'up-to-date', live: LIVE, running: RUNNING, installed: 'same' })
    ).toBe(`线上已有 ${LIVE}，但本机还没拿到更新包，请稍后再试`)
  })

  it('SW 无新版本、预缓存就是当前构建、取不到线上 → 已是最新版本', () => {
    expect(
      manualCheckNote({ readiness: 'up-to-date', live: null, running: RUNNING, installed: 'same' })
    ).toBe('已是最新版本')
  })

  it('读不到预缓存信息 → 合并兜底文案（含本机/线上版本与重开建议）', () => {
    expect(
      manualCheckNote({ readiness: 'up-to-date', live: LIVE, running: RUNNING, installed: 'unknown' })
    ).toBe(
      `线上已有 ${LIVE}（本机 ${RUNNING}）。如果刚更新过，请把 App 彻底关掉再打开；否则请稍后再试`
    )
  })

  it('读不到预缓存信息且取不到线上 → 已是最新版本', () => {
    expect(
      manualCheckNote({ readiness: 'up-to-date', live: null, running: RUNNING, installed: 'unknown' })
    ).toBe('已是最新版本')
  })
})

describe('applyNotReadyNote', () => {
  it('pending → 正在下载', () => {
    expect(applyNotReadyNote('pending')).toBe('更新正在下载，请稍后再试')
  })

  it('failed → 检查失败', () => {
    expect(applyNotReadyNote('failed')).toBe('检查更新失败，请稍后再试')
  })

  it('timeout → 检查超时', () => {
    expect(applyNotReadyNote('timeout')).toBe('检查更新超时，请稍后再试')
  })

  it('up-to-date / unavailable → 更新还没准备好', () => {
    expect(applyNotReadyNote('up-to-date')).toBe('更新还没准备好，请稍后再试')
    expect(applyNotReadyNote('unavailable')).toBe('更新还没准备好，请稍后再试')
  })
})
