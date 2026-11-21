import { useEffect, useState } from 'preact/hooks'
import type { CategoryUsage, StorageUsage as Usage } from './estimate'
import { estimateStorage } from './estimate'
import { formatBytes } from './format'
import { clearCachedAssets } from '../assets/store'

// 设置页「本机存储」：打开时统计一次（读 IDB 四表 + Cache Storage）。
// 任一类失败 → 该行与总量显示「—」，附重试提示，不让错误整块消失或当 0。

// 分类行只展示数据本体；记录字段/主键/缓存元数据统一进「记录与索引开销」，
// 避免同一份开销在分类行与开销行重复计入总量。

function rowBytes(u: CategoryUsage | null): number | null {
  return u ? u.contentBytes : null
}

function countText(u: CategoryUsage | null, unit: string, skippedText?: string): string {
  if (!u) return '—'
  const base = `${u.count} ${unit}`
  return u.skipped > 0 && skippedText ? `${base}（另有 ${u.skipped} ${skippedText}）` : base
}

function sizeText(bytes: number | null): string {
  return bytes === null ? '—' : formatBytes(bytes)
}

export function StorageUsage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeError, setNoticeError] = useState(false)

  useEffect(() => {
    let alive = true
    estimateStorage().then(
      (u) => {
        if (alive) setUsage(u)
      },
      () => {
        if (alive) setFailed(true)
      }
    )
    return () => {
      alive = false
    }
  }, [])

  /** 清理后原地重算，不要求重开设置页。 */
  async function refresh(): Promise<void> {
    try {
      setUsage(await estimateStorage())
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  async function onClear(): Promise<void> {
    setClearing(true)
    setNotice(null)
    try {
      const { count, bytes } = await clearCachedAssets()
      setNotice(`已清理 ${count} 个资源（约 ${formatBytes(bytes)}）`)
      setNoticeError(false)
      setConfirming(false)
      await refresh()
    } catch {
      setNotice('清理失败，请重试。')
      setNoticeError(true)
    } finally {
      setClearing(false)
    }
  }

  const rows = usage ? [usage.notes, usage.assets, usage.cache, usage.settings] : []
  const complete = rows.every((r): r is CategoryUsage => r !== null)
  const overhead = complete ? rows.reduce((sum, r) => sum + r.overheadBytes, 0) : null
  const total =
    complete && overhead !== null
      ? rows.reduce((sum, r) => sum + r.contentBytes, 0) + overhead
      : null
  const assets = usage?.assets ?? null
  const canClear = assets !== null && assets.count > 0

  function actions() {
    if (!assets) return null
    return (
      <div class="storage__actions">
        {confirming ? (
          <>
            <p class="storage__confirm">
              {`将清除 ${assets.count} 个资源（约 ${formatBytes(assets.contentBytes)}）。离线时这些图片将不再显示；联网重新打开笔记会再次下载。`}
            </p>
            <div class="storage__buttons">
              <button
                type="button"
                class="btn btn--danger"
                onClick={onClear}
                disabled={clearing}
              >
                {clearing ? '清理中…' : '确认清理'}
              </button>
              <button
                type="button"
                class="btn"
                onClick={() => setConfirming(false)}
                disabled={clearing}
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <div class="storage__buttons">
            <button
              type="button"
              class="btn"
              onClick={() => {
                setNotice(null)
                setConfirming(true)
              }}
              disabled={!canClear}
            >
              清理图片等资源缓存
            </button>
            {!canClear && <span class="field__hint">没有已缓存的资源</span>}
          </div>
        )}
        {notice && (
          <p class={noticeError ? 'storage__notice storage__notice--error' : 'storage__notice'}>
            {notice}
          </p>
        )}
      </div>
    )
  }

  return (
    <div class="field">
      <span class="field__label">本机存储</span>
      {failed ? (
        <span class="field__hint">统计失败，重新打开设置可重试。</span>
      ) : !usage ? (
        <span class="field__hint">统计中…</span>
      ) : (
        <div class="storage">
          <div class="storage__total">共 {total === null ? '—' : formatBytes(total)}</div>

          <div class="storage__row">
            <span class="storage__name">笔记</span>
            <span class="storage__count">{countText(usage.notes, '篇', '篇超大未镜像')}</span>
            <span class="storage__size">{sizeText(rowBytes(usage.notes))}</span>
          </div>

          <div class="storage__row">
            <span class="storage__name">图片等资源</span>
            <span class="storage__count">
              {countText(usage.assets, '个', '个超大未缓存')}
            </span>
            <span class="storage__size">{sizeText(rowBytes(usage.assets))}</span>
          </div>

          {actions()}

          <div class="storage__row">
            <span class="storage__name">应用离线缓存</span>
            <span class="storage__count">{countText(usage.cache, '项')}</span>
            <span class="storage__size">{sizeText(rowBytes(usage.cache))}</span>
          </div>

          <div class="storage__row">
            <span class="storage__name">设置与阅读数据</span>
            <span class="storage__count">{countText(usage.settings, '项')}</span>
            <span class="storage__size">{sizeText(rowBytes(usage.settings))}</span>
          </div>

          <div class="storage__row">
            <span class="storage__name">记录与索引开销</span>
            <span class="storage__count" />
            <span class="storage__size">
              {overhead === null ? '—' : formatBytes(overhead)}
            </span>
          </div>

          <p class="field__hint">
            统计的是应用保存在浏览器里的数据量和记录字段；浏览器底层的页对齐、压缩、日志等开销无法从网页读取，未计入。
          </p>
          {!complete && (
            <p class="field__hint">部分数据读取失败，重新打开设置可重试。</p>
          )}
        </div>
      )}
    </div>
  )
}
